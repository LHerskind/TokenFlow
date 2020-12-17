const Web3 = require("web3");
const fetch = require("node-fetch");

var config = require("./config");

const erc20abi = require("./public/abis/erc20.json");

module.exports.getTransfers = function (txhash) {
	return getTransfers(txhash);
};

let etherscanApiKey = config.etherscanApiKey;
var web3 = new Web3(Web3.givenProvider || config.infuraHost);

let ethAddr = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
let wethAddr = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

function getEvent(log) {
	let transferEvent =
		"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
	let approvalEvent =
		"0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
	let depositEvent =
		"0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";
	let withdrawelEvent =
		"0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";
	if (log["topics"][0].toLowerCase() == transferEvent) {
		return [getTransfer(log)];
	} else if (log["topics"][0].toLowerCase() == approvalEvent) {
		//return getApproval(log);
	} else if (log["topics"][0].toLowerCase() == depositEvent) {
		return getDeposits(log);
	} else if (log["topics"][0].toLowerCase() == withdrawelEvent) {
		return getWithdrawel(log);
	}
	return [];
}

function getDeposits(log) {
	let topics = [];
	for (let i = 1; i < log["topics"].length; i++) {
		topics.push(log["topics"][i]);
	}

	let res = web3.eth.abi.decodeLog(
		[
			{
				type: "address",
				name: "dst",
				indexed: true,
			},
			{
				type: "uint256",
				name: "wad",
			},
		],
		log["data"],
		topics
	);

	let deposits = [];

	deposits.push({
		type: "transfer",
		from: res["dst"].toLowerCase(),
		to: wethAddr,
		amount: res["wad"],
		token: ethAddr,
	});
	deposits.push({
		type: "transfer",
		from: wethAddr,
		to: res["dst"].toLowerCase(),
		amount: res["wad"],
		token: wethAddr,
	});

	return deposits;
}

function getWithdrawel(log) {
	let topics = [];
	for (let i = 1; i < log["topics"].length; i++) {
		topics.push(log["topics"][i]);
	}

	let res = web3.eth.abi.decodeLog(
		[
			{
				type: "address",
				name: "src",
				indexed: true,
			},
			{
				type: "uint256",
				name: "wad",
			},
		],
		log["data"],
		topics
	);

	let withdrawels = [];

	withdrawels.push({
		type: "transfer",
		from: res["src"].toLowerCase(),
		to: wethAddr,
		amount: res["wad"],
		token: wethAddr,
	});
	withdrawels.push({
		type: "transfer",
		from: wethAddr,
		to: res["src"].toLowerCase(),
		amount: res["wad"],
		token: ethAddr,
	});

	return withdrawels;
}

// The easiest seems to be by getting the individual "Transfers".
// We need to take ether into account, it is not an ERC20 :O will not have a normal transfer?
function getTransfer(log) {
	let tokenAddress = log["address"].toLowerCase();

	let topics = [];
	for (let i = 1; i < log["topics"].length; i++) {
		topics.push(log["topics"][i]);
	}

	let res = web3.eth.abi.decodeLog(
		[
			{
				type: "address",
				name: "src",
				indexed: true,
			},
			{
				type: "address",
				name: "dst",
				indexed: true,
			},
			{
				type: "uint256",
				name: "wad",
			},
		],
		log["data"],
		topics
	);

	return {
		type: "transfer",
		from: res["src"].toLowerCase(),
		to: res["dst"].toLowerCase(),
		amount: res["wad"],
		token: tokenAddress,
	};
}

async function getUsefulLogs(tx, initialEvent) {
	// TODO: Maybe we should include approves :thinking:
	let _logs = tx["logs"];
	let events = [];

	if (initialEvent != null && initialEvent != undefined) {
		events.push(initialEvent);
	}

	for (let i = 0; i < _logs.length; i++) {
		getEvent(_logs[i]).forEach((transfer) => {
			events.push(transfer);
		});
	}

	let tokensToLookAt = {};
	for (let i = 0; i < events.length; i++) {
		let tokenAddress = events[i]["token"].toLowerCase();
		tokensToLookAt[tokenAddress] = true;
	}

	let tokens = await batchGetCoins(tokensToLookAt);

	return { transfers: events, tokens: tokens };
}

async function batchGetCoins(tokensToLookAt) {
	let batch = new web3.BatchRequest();
	let addresses = Object.keys(tokensToLookAt);

	let tokens = {
		"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee": {
			symbol: "ETH",
			decimals: "18",
		},
	};

	let calls = [];
	addresses.map((address) => {
		if (address != ethAddr) {
			let erc20Contract = new web3.eth.Contract(erc20abi, address);
			let symbolCall = erc20Contract.methods.symbol().call;
			let decimalsCall = erc20Contract.methods.decimals().call;
			calls.push(symbolCall);
			calls.push(decimalsCall);
		}
	});

	if (calls.length == 0) {
		return tokens;
	}

	let promises = calls.map((call) => {
		return new Promise((res, rej) => {
			let req = call.request({}, "latest", (err, data) => {
				if (err) rej(err);
				else res(data);
			});
			batch.add(req);
		});
	});

	batch.execute();
	let coins = await Promise.all(
		promises.map((p) => {
			return p.catch((e) => {
				if (e.reason == "overflow") {
					let val = web3.utils.toHex(e.value);
					let res = web3.utils.hexToUtf8(val);
					return res;
				}
				return e.reason;
			});
		})
	);

	let i = 0;
	addresses.map((address) => {
		if (address != ethAddr) {
			tokens[address] = { symbol: coins[i], decimals: coins[i + 1] };
			i = i + 2;
		}
	});

	return tokens;
}

async function getEthTransfers(txhash) {
	let url =
		"https://api.etherscan.io/api?module=account&action=txlistinternal&txhash=";
	url = url + txhash;
	url = url + "&apikey=" + etherscanApiKey;

	try {
		var response = await fetch(url);
	} catch (err) {
		console.log(err);
		return [];
	}

	let data = await response.json();
	if (data["status"] != "1" || data["message"] != "OK") {
		return [];
	}

	let eth_transfers = [];

	for (let i = 0; i < data["result"].length; i++) {
		let res = data["result"][i];
		let from = res["from"];
		let to = res["to"];
		let type = "ethtransfer";
		let amount = res["value"];

		if (amount == "0" || to == "") {
			continue;
		}

		if (from == wethAddr) {
			// Withdraw eth from the contract
			eth_transfers.push({
				type: "withdrawel",
				from: from,
				to: to,
				amount: res["value"],
				token: ethAddr,
			});
		} else if (to == wethAddr) {
			// Deposit eth into weth contract
			eth_transfers.push({
				type: "transfer",
				from: from,
				to: to,
				amount: res["value"],
				token: ethAddr,
			});
			continue;
		} else {
			let transfer = {
				type: type,
				from: from,
				to: to,
				amount: res["value"],
				token: ethAddr,
			};
			eth_transfers.push(transfer);
		}
	}
	return eth_transfers;
}

function prepend(value, array) {
	var newArray = array.slice();
	newArray.unshift(value);
	return newArray;
}

function getBefores(limits, ethsLen, ercLen) {
	let beforeKeys = Object.keys(limits["before"]);
	beforeKeys.sort();
	let befores = [];
	beforeKeys.forEach((key) => {
		// If the key exist, set before[curLength:key] = indexvalue
		let indexValue = parseInt(limits["before"][key]);
		let length = befores.length;
		for (let i = length; i <= parseInt(key); i++) {
			befores.push(indexValue);
		}
	});
	// For the rest, set before the end.
	for (let i = befores.length; i < ethsLen; i++) {
		befores.push(ercLen);
	}
	return befores;
}

function getAfters(limits, ethsLen, ercLen) {
	let afterKeys = Object.keys(limits["after"]);
	afterKeys.sort();
	afterKeys.reverse();
	let afters = [];
	let lastVal = ethsLen - 1;
	afterKeys.forEach((key) => {
		let indexValue = parseInt(limits["after"][key]);
		let count = 0;
		for (let i = lastVal; i >= parseInt(key); i--) {
			count++;
			afters = prepend(indexValue, afters);
		}
		lastVal = lastVal - count;
	});
	for (let i = lastVal; i >= 0; i--) {
		afters = prepend(0, afters);
	}
	return afters;
}

async function joinERCEthTransfers(_from, _eths, _ercs) {
	console.log("Total eth transfers: ", _eths.length);
	let preciseLocation = {};
	let transferMatch = (a, b) => {
		return (
			a["to"] == b["to"] &&
			a["from"] == b["from"] &&
			a["amount"] == b["amount"] &&
			a["token"] == b["token"]
		);
	};

	for (let i = 0; i < _ercs.length; i++) {
		let transfer = _ercs[i];
		if (transfer["to"] == wethAddr || transfer["from"] == wethAddr) {
			// Depositing into or withdrawing from weth
			for (let j = 0; j < _eths.length; j++) {
				if (transferMatch(_ercs[i], _eths[j])) {
					// Find the matching pair
					preciseLocation[j] = i;
					break;
				}
			}
		}
	}

	let limits = { after: {}, before: {} };

	for (let i = 0; i < _eths.length; i++) {
		if (preciseLocation[i] != undefined) {
			limits["after"][i] = preciseLocation[i] - 1;
			limits["before"][i] = preciseLocation[i];
			continue;
		}
	}

	console.log("limit with precise: ", limits);

	let lastInteraction = { sent: {}, received: {} };
	for (let i = 0; i < _ercs.length; i++) {
		lastInteraction["sent"][_ercs[i]["from"]] = i;
		lastInteraction["received"][_ercs[i]["to"]] = i;
	}

	// Find the addresses that have sent but not received
	let sentButNeverReceive = [];
	Object.keys(lastInteraction["sent"]).forEach((sender) => {
		if (lastInteraction["received"][sender] == undefined) {
			// Have not received!
			let index = lastInteraction["sent"][sender];
			sentButNeverReceive.push({ receiver: sender, before: index });
		}
	});
	//console.log("Sent but never receive: ", sentButNeverReceive);

	// Find the addresses that have received but not send
	let receiveButNeverSend = [];
	Object.keys(lastInteraction["received"]).forEach((receiver) => {
		if (lastInteraction["sent"][receiver] == undefined) {
			let index = lastInteraction["received"][receiver];
			receiveButNeverSend.push({ sender: receiver, after: index });
		}
	});
	//console.log("Receive but never sent: ", receiveButNeverSend);

	// We must figure out where it is!
	for (let i = 0; i < _eths.length; i++) {
		if (_eths[i]["to"] == _from) {
			continue;
		}
		for (let j = 0; j < sentButNeverReceive.length; j++) {
			if (_eths[i]["to"] == sentButNeverReceive[j]["receiver"]) {
				limits["before"][i] = sentButNeverReceive[j]["before"];
			}
		}
		for (let j = 0; j < receiveButNeverSend.length; j++) {
			if (_eths[i]["from"] == receiveButNeverSend[j]["sender"]) {
				limits["after"][i] = receiveButNeverSend[j]["after"];
			}
		}
	}

	console.log("Limits: ", limits);

	let afters = getAfters(limits, _eths.length, _ercs.length);
	let befores = getBefores(limits, _eths.length, _ercs.length);

	console.log("After: ", afters);
	console.log("Before: ", befores);

	let guide = [];
	let useFulEths = [];
	for (let i = 0; i < _eths.length; i++) {
		if (preciseLocation[i] != undefined && preciseLocation[i] != null) {
			continue;
		}
		useFulEths.push(_eths[i]);
		let from = _eths[i]["from"];
		let to = _eths[i]["to"];
		let tempVal = afters[i];
		for (let j = afters[i]; j < befores[i]; j++) {
			// Run only in the interval that is from afters <= j < before. Maybe we should not look at both receiver and sender?
			if (_ercs[j]["to"] == from) {
				tempVal = j; // The last time interacted in this interval
			}
			/*if (_ercs[j]["to"] == from || _ercs[j]["from"] == to) {
				tempVal = j; // The last time interacted in this interval
			}*/
		}
		if (guide.length > 0) {
			tempVal =
				tempVal > guide[guide.length - 1]
					? tempVal
					: guide[guide.length - 1];
			guide.push(tempVal);
		} else {
			guide.push(tempVal);
		}
	}
	console.log("Guide: ", guide);

	let ercIndex = 0;
	let ethIndex = 0;

	let fullTransfers = [];
	while (ercIndex < _ercs.length || ethIndex < useFulEths.length) {
		if (ercIndex < _ercs.length && guide[ethIndex] + 1 > ercIndex) {
			fullTransfers.push(_ercs[ercIndex]);
			ercIndex++;
		} else if (
			ethIndex < useFulEths.length &&
			guide[ethIndex] + 1 == ercIndex
		) {
			fullTransfers.push(useFulEths[ethIndex]);
			ethIndex++;
		} else if (ethIndex == useFulEths.length) {
			fullTransfers.push(_ercs[ercIndex]);
			ercIndex++;
		} else {
			fullTransfers.push(useFulEths[ethIndex]);
			ethIndex++;
		}
	}

	return fullTransfers;
}

async function getTransfers(txhash) {
	try {
		var initialTransfer = await web3.eth.getTransaction(txhash);
	} catch (err) {
		console.log(err);
		if (err["reason"] != undefined) {
			return { err: err["reason"] };
		} else {
			return { err: "Could not retrieve tx" };
		}
	}
	if (initialTransfer == null || initialTransfer == undefined) {
		return { err: "No transaction found" };
	}

	let event = null;
	let from = initialTransfer["from"].toLowerCase();
	if (initialTransfer["value"] != "0") {
		let to = initialTransfer["to"].toLowerCase();
		event = {
			type: "ethtransfer",
			from: from,
			to: to,
			amount: initialTransfer["value"],
			token: ethAddr,
		};
	}

	if (initialTransfer["gas"] == 21000) {
		// Just a simple transfer
		let tokens = {
			"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee": {
				symbol: "ETH",
				decimals: "18",
			},
		};
		return {
			transfers: [event],
			tokens: tokens,
			sender: from,
		};
	}
	try {
		var tx = await web3.eth.getTransactionReceipt(txhash);
	} catch (err) {
		console.log(err);
		if (err["reason"] != undefined) {
			return { err: err["reason"] };
		} else {
			return { err: "Could not retrieve tx receipt" };
		}
	}
	let erc20s = await getUsefulLogs(tx, event);

	let useEth = true;
	let res = null;
	if (useEth) {
		let eths = await getEthTransfers(txhash);
		let transfers = await joinERCEthTransfers(
			from,
			eths,
			erc20s["transfers"]
		);
		res = { transfers: transfers, tokens: erc20s["tokens"], sender: from };
	} else {
		res = {
			transfers: erc20s["transfers"],
			tokens: erc20s["tokens"],
			sender: from,
		};
	}
	return res;
}
