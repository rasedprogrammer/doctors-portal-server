const express = require("express");
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;

const app = express();

// Middleware configuration
app.use(cors());
app.use(express.json());

// MongoDb Connection
/**
 * ================================================================================
 */

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@programmingherocluster.fdfar9q.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri);
const client = new MongoClient(uri, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	serverApi: ServerApiVersion.v1,
});

// Server configuration
async function run() {
	try {
		const appointmentOptionCollection = client
			.db("doctorsPortal")
			.collection("appointmentOptions");
		const bookingsCollection = client
			.db("doctorsPortal")
			.collection("bookings");

		// Get Aggregate to query multiple collection and then merge data
		app.get("/appointmentOptions", async (req, res) => {
			const date = req.query.date;
			const query = {};
			const options = await appointmentOptionCollection.find(query).toArray();
			const bookingQuery = { appointmentDate: date };
			const alreadyBooked = await bookingsCollection
				.find(bookingQuery)
				.toArray();
			options.forEach((option) => {
				const bookingOption = alreadyBooked.filter(
					(book) => book.treatment === option.name
				);
				const bookedSlots = bookingOption.map((book) => book.slot);
				console.log(date, option.name, bookedSlots);
			});
			res.send(options);
		});

		app.post("/bookings", async (req, res) => {
			const booking = req.body;
			const result = await bookingsCollection.insertOne(booking);
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
