const express = require("express");
var tools = require("./tools.js");

const cors = require("cors");
const app = express();
const { PORT = 3000 } = process.env;

app.use(cors());
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");
app.use(express.static("./public"));

app.get("/", (req, res) => {
	res.render("index");
});

app.get("/tx/:txhash", (req, res) => {
	res.render("index");
});

app.get("/transfers/:txhash", (req, res) => {
	let txhash = req.params.txhash;
	tools
		.getTransfers(txhash)
		.then((transfers) => {
			res.status(200).send(transfers);
		})
		.catch((err) => {
			console.log(err);
			let pokkers = {desc: "There was an error :(", err: err}
			res.status(200).send(pokkers);
		});
});

app.listen(PORT, () => {
	console.log(`server started at ${PORT}`);
});
