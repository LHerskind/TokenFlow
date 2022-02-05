const express = require("express");
var tools = require("./tools.js");

const cors = require("cors");
const app = express();
const { PORT = 80 } = process.env;

app.use(cors());
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");
app.use(express.static("./public"));

/**
 * get api
 */

app.get("/", getIndex);

app.get("/tx/:txhash", getTxTxhash);

app.get("/transfers/:txhash", getTxTransfers);

/**
 * functions
 */

function getIndex(req, res) {
	res.render("index");
}

// when calling this on localhost, make sure to use "localhost/tx/0x..." instead of "https://localhost/tx/0x..."
function getTxTxhash(req, res) {
	res.render("index");
}

function getTxTransfers(req, res) {
	let txhash = req.params.txhash;
	tools
		.getTransfers(txhash)
		.then((transfers) => {
			res.status(200).send(transfers);
		})
		.catch((err) => {
			console.log(err);
			let pokkers = { desc: "There was an error :(", err: err }
			res.status(200).send(pokkers);
		});
}

app.listen(PORT, () => {
	console.log(`server started at ${PORT}`);
});
