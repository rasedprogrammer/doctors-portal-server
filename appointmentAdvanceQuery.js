// app.get("/v2/appointmentOptions", async (req, res) => {
// 	const date = req.query.date;
// 	const options = await appointmentOptionCollection
// 		.aggregate([
// 			{
// 				$lookup: {
// 					from: "bookings",
// 					localField: "name",
// 					foreignField: "treatment",
// 					pipeline: [
// 						{
// 							$match: {
// 								$expr: {
// 									$eq: ["appointmentDate", date],
// 								},
// 							},
// 						},
// 					],
// 					as: "booked",
// 				},
// 			},
// 			{
// 				$project: {
// 					name: 1,
// 					slots: 1,
// 					booked: {
// 						$map: {
// 							input: "$booked",
// 							as: "book",
// 							in: "$$book.slot",
// 						},
// 					},
// 				},
// 			},
// 			{
// 				$project: {
// 					name: 1,
// 					slots: {
// 						$setDifference: ["$slots", "$booked"],
// 					},
// 				},
// 			},
// 		])
// 		.toArray();
// 	res.send(options);
// });
