const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const nodemailer = require("nodemailer");
const mg = require("nodemailer-mailgun-transport");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

const app = express();

// Middleware configuration
app.use(cors());
app.use(express.json());

// MongoDb Connection
/**
 * ================================================================================
 */
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@programmingherocluster.fdfar9q.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri);
const client = new MongoClient(uri, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	serverApi: ServerApiVersion.v1,
});

// Token VerifyJWT
function verifyJwt(req, res, next) {
	const authHeader = req.headers.authorization;
	if (!authHeader) {
		return res.status(401).send("Unauthrized Access");
	}
	const token = authHeader.split(" ")[1];
	jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
		if (err) {
			return res.status(403).send({ message: "Forbidden Access" });
		}
		req.decoded = decoded;
		next();
	});
}

function sendBookingEmail(booking) {
	const { email, treatment, appointmentDate, slot } = booking;

	const auth = {
		auth: {
			api_key: process.env.EMAIL_SEND_KEY,
			domain: process.env.EMAIL_SEND_DOMAIN,
		},
	};

	const transporter = nodemailer.createTransport(mg(auth));

	// let transporter = nodemailer.createTransport({
	// 	host: "smtp.sendgrid.net",
	// 	port: 587,
	// 	auth: {
	// 		user: process.env.SENDGRID_API_KEY,
	// 		pass: process.env.SENDGRID_API_KEY,
	// 	},
	// });
	transporter.sendMail(
		{
			from: "rasedprogrammer@gmail.com", // verified sender email
			to: email || "rasedprogrammer@gmail.com", // recipient email
			subject: `Your appointment ${treatment} has been confirmed.`, // Subject line
			text: "Hello world!", // plain text body
			html: `
				<h3>Your appointment is confirm.</h3>
				<p>Please come ${appointmentDate} at ${slot} for your treatment.</p>
				<p>Thank You</p>
			`, // html body
		},
		function (error, info) {
			if (error) {
				console.log(error);
			} else {
				console.log("Email sent: " + info.response);
			}
		}
	);
}

// Server configuration
async function run() {
	try {
		//================================================
		const appointmentOptionCollection = client
			.db("doctorsPortal")
			.collection("appointmentOptions");
		const bookingsCollection = client
			.db("doctorsPortal")
			.collection("bookings");
		const usersCollection = client.db("doctorsPortal").collection("users");
		const doctorsCollection = client.db("doctorsPortal").collection("doctors");
		const paymentsCollection = client
			.db("doctorsPortal")
			.collection("payments");
		//================================================

		// VerifyAdmin Middleware
		// make sure you use verifyAdmin After verifyJWT
		const verifyAdmin = async (req, res, next) => {
			const decodedEmail = req.decoded.email;
			const query = { email: decodedEmail };
			const user = await usersCollection.findOne(query);

			if (user?.role !== "admin") {
				return res.status(403).send({ message: "Forbidden Access" });
			}
			next();
		};

		// Get Aggregate to query multiple collection and then merge data
		app.get("/appointmentOptions", async (req, res) => {
			const date = req.query.date;
			const query = {};
			const options = await appointmentOptionCollection.find(query).toArray();
			// Get the provide booking date
			const bookingQuery = { appointmentDate: date };
			const alreadyBooked = await bookingsCollection
				.find(bookingQuery)
				.toArray();
			// Code Carefully :D
			options.forEach((option) => {
				const bookingOption = alreadyBooked.filter(
					(book) => book.treatment === option.name
				);
				const bookedSlots = bookingOption.map((book) => book.slot);
				const remainingSlots = option.slots.filter(
					(slot) => !bookedSlots.includes(slot)
				);
				option.slots = remainingSlots;
				// console.log(date, option.name, bookedSlots, remainingSlots);
			});
			res.send(options);
		});

		// Appointment Specialty Option Get API
		app.get("/appointmentSpecialty", async (req, res) => {
			const query = {};
			const result = await appointmentOptionCollection
				.find(query)
				.project({ name: 1 })
				.toArray();
			res.send(result);
		});
		//Doctor Data API
		app.get("/doctors", verifyJwt, verifyAdmin, async (req, res) => {
			const query = {};
			const doctors = await doctorsCollection.find(query).toArray();
			res.send(doctors);
		});
		app.post("/doctors", verifyJwt, verifyAdmin, async (req, res) => {
			const doctor = req.body;
			const result = await doctorsCollection.insertOne(doctor);
			res.send(result);
		});
		app.delete("/doctors/:id", verifyJwt, verifyAdmin, async (req, res) => {
			const id = req.params.id;
			const filter = { _id: ObjectId(id) };
			const result = await doctorsCollection.deleteOne(filter);
			res.send(result);
		});
		// Bookings A
		app.get("/bookings", verifyJwt, async (req, res) => {
			const email = req.query.email;
			const decodedEmail = req.decoded.email;

			if (email !== decodedEmail) {
				return res.status(403).send({ message: "Forbidden Access" });
			}

			const query = { email: email };
			const bookings = await bookingsCollection.find(query).toArray();
			res.send(bookings);
		});
		app.get("/bookings/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: ObjectId(id) };
			const booking = await bookingsCollection.findOne(query);
			res.send(booking);
		});

		app.post("/bookings", async (req, res) => {
			const booking = req.body;
			const query = {
				appointmentDate: booking.appointmentDate,
				email: booking.email,
				treatment: booking.treatment,
			};
			const alreadyBooked = await bookingsCollection.find(query).toArray();

			if (alreadyBooked.length) {
				const message = `You already have a booking on ${booking.appointmentDate}`;
				return res.send({ acknowledged: false, message });
			}
			const result = await bookingsCollection.insertOne(booking);
			// Send Appointment Confirm Email
			sendBookingEmail(booking);
			res.send(result);
		});

		app.post("/create-payment-intent", async (req, res) => {
			const booking = req.body;
			const price = booking.price;
			const amount = price * 100;

			const paymentIntent = await stripe.paymentIntents.create({
				amount: amount,
				currency: "usd",
				payment_method_types: ["card"],
			});

			res.send({
				clientSecret: paymentIntent.client_secret,
			});
		});

		app.post("/payments", async (req, res) => {
			const payment = req.body;
			console.log(payment);
			const result = await paymentsCollection.insertOne(payment);

			const id = payment.bookingId;
			const filter = { _id: ObjectId(id) };
			const updatedDoc = {
				$set: {
					paid: true,
					transactionId: payment.transactionId,
				},
			};
			const updateResult = await bookingsCollection.updateOne(
				filter,
				updatedDoc
			);

			res.send(result);
		});

		// Users API
		//JWT Token Set
		app.get("/jwt", async (req, res) => {
			const email = req.query.email;
			const query = { email: email };
			const user = await usersCollection.findOne(query);
			if (user) {
				const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
					expiresIn: "1h",
				});
				return res.send({ accessToken: token });
			}
			res.status(403).send({ accessToken: "" });
		});
		// User Get
		app.get("/users", async (req, res) => {
			const query = {};
			const users = await usersCollection.find(query).toArray();
			res.send(users);
		});

		//Admin Login API
		app.get("/users/admin/:email", async (req, res) => {
			const email = req.params.email;
			const query = { email };
			const user = await usersCollection.findOne(query);
			res.send({ isAdmin: user?.role === "admin" });
		});

		// Admin Make API
		app.put("/users/admin/:id", async (req, res) => {
			const id = req.params.id;
			console.log(id);
			const filter = { _id: ObjectId(id) };
			console.log(filter);
			const options = { upsert: true };
			const updateDoc = {
				$set: {
					role: "admin",
				},
			};
			const result = await usersCollection.updateOne(
				filter,
				updateDoc,
				options
			);
			res.send(result);
		});

		// Temporary to update price field on appointment options
		// app.get("/appPrice", async (req, res) => {
		// 	const filter = {};
		// 	const option = { upsert: true };
		// 	const updateDoc = {
		// 		$set: {
		// 			price: 99,
		// 		},
		// 	};
		// 	const result = await appointmentOptionCollection.updateMany(
		// 		filter,
		// 		updateDoc,
		// 		option
		// 	);
		// 	res.send(result);
		// });

		// User Insert
		app.post("/users", async (req, res) => {
			const users = req.body;
			const result = await usersCollection.insertOne(users);
			res.send(result);
		});
	} finally {
	}
}
run().catch(console.log);

/**
 * ================================================================================
 */
app.get("/", async (req, res) => {
	res.send("Doctors Portal Server Is Running");
});

app.listen(port, () => {
	console.log(`Listing From Doctors Portal ${port}`);
});
