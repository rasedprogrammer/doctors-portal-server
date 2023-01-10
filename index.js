const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");
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
		//================================================

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
			res.send(result);
		});

		// Users API
		//JWT
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

		app.get("/users", async (req, res) => {
			const query = {};
			const users = await usersCollection.find(query).toArray();
			res.send(users);
		});

		app.put("/users/admin/:id", verifyJwt, async (req, res) => {
			const decodedEmail = req.decoded.email;
			const query = { email: decodedEmail };
			const user = await usersCollection.findOne(query);
			if (user.role !== "admin") {
				return res.status(403).send({ message: "Forbidden Access" });
			}

			const id = req.params.id;
			const filter = { _id: ObjectId(id) };
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
