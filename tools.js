const Web3 = require("web3");
const fetch = require("node-fetch");

// var config = require("./config");

const erc20abi = require("./public/abis/erc20.json");

//lets us delay execution of a function
const delay = ms => new Promise(res => setTimeout(res, ms));

module.exports.getTransfers = function (txhash) {
	return getTransfers(txhash);
};

// we can ignore these if we wait 300 ms between each call to each unique api
// let etherscanApiKey = config.etherscanApiKey;
// let bscscanApiKey = config.bscscanApiKey;
// let polygonscanApiKey = config.polygonscanApiKey;
// let snowtraceApiKey = config.snowtraceApiKey;
// let arbiscanApiKey = config.arbiscanApiKey;
// let optimisticApiKey = config.optimisticApiKey;
// let hooScanApiKey = config.hooScanApiKey;
// let moonscanApiKey = config.moonscanApiKey;
// let moonRiverApiKey = config.moonRiverApiKey;
// let FtmScanApiKey = config.FtmScanApiKey;
// let CronoScanApiKey = config.CronoScanApiKey;
//set them by default
var web3 = new Web3(Web3.givenProvider); //|| config.infuraHost
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
		return [getApproval(log)];
	} else if (log["topics"][0].toLowerCase() == depositEvent) {
		return getDeposits(log);
	} else if (log["topics"][0].toLowerCase() == withdrawelEvent) {
		return getWithdrawel(log);
	}
	return [];
}

function getApproval(log) {
	let tokenAddress = log["address"].toLowerCase();

	let topics = [];
	for (let i = 1; i < log["topics"].length; i++) {
		topics.push(log["topics"][i]);
	}

	let res = web3.eth.abi.decodeLog(
		[
			{
				type: "address",
				name: "owner",
				indexed: true,
			},
			{
				type: "address",
				name: "spender",
				indexed: true,
			},
			{
				type: "uint256",
				name: "value",
			},
		],
		log["data"],
		topics
	);

	return {
		type: "approval",
		from: res["owner"].toLowerCase(),
		to: res["spender"].toLowerCase(),
		amount: res["value"],
		token: tokenAddress,
	};
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

async function findNetwork(txhash) {

	await delay(300); // we have to delay this call to avoid the API rate limit
	//console.log("Finding network for txhash: " + txhash);

	//we'll intentionally create side-effects to change wETHAddr and web3 to the correct address and provider
	//this will allow functionality on every network that blockscan.com supports

	let url, data; //exist
	// console.log(config.etherscanAPIKey)
	url = "https://api.etherscan.io/api?module=account&action=txlistinternal&txhash=" + txhash;//+ "&apikey=" + config.etherscanApiKey;
	try {
		console.log("trying etherscan: " + url);
		var response = await fetch(url);
		data = await response.json();
		if (data["status"] == "1") {
			web3 = new Web3(new Web3.providers.HttpProvider("https://nodes.mewapi.io/rpc/eth")); //|| config.infuraHost
			wethAddr = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
			//console.log("Ethereum");
			return data;
		}
	} catch (err) {
		//console.log(err);
		//return [];
	}

	url = "https://api.bscscan.com/api?module=account&action=txlistinternal&txhash=" + txhash;
	try {
		console.log("trying bscscan: " + url);
		var response = await fetch(url);
		data = await response.json();
		if (data["status"] == "1") {
			wETHAddr = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"; // wrapped BNB
			web3 = new Web3(new Web3.providers.HttpProvider("https://bsc-dataseed.binance.org/"));
			//console.log("Binance");
			return data;
		}
	} catch (err) {
		//console.log(err);
		//return [];
	}

	url = "https://api.polygonscan.com/api?module=account&action=txlistinternal&txhash=" + txhash;
	try {
		console.log("trying polygonscan: " + url);
		var response = await fetch(url);
		data = await response.json();
		if (data["status"] == "1") {
			wETHAddr = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"; // wrapped MATIC
			web3 = new Web3(new Web3.providers.HttpProvider("https://rpc-mainnet.maticvigil.com"));
			//console.log("Polygon");
			return data;
		}
	} catch (err) {
		//console.log(err);
		//return [];
	}

	url = "https://api.ftmscan.com/api?module=account&action=txlistinternal&txhash=" + txhash;
	try {
		console.log("trying ftmscan: " + url);
		var response = await fetch(url);
		data = await response.json();
		if (data["status"] == "1") {
			wETHAddr = "0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83"; // wrapped FTM
			web3 = new Web3(new Web3.providers.HttpProvider("https://rpcapi.fantom.network/"));
			//console.log("Fantom");
			return data;
		}
	} catch (err) {
		//console.log(err);
		//return [];
	}

	url = "https://api.hecoinfo.com/api?module=account&action=txlistinternal&txhash=" + txhash;
	try {
		console.log("trying hecoinfo: " + url);
		var response = await fetch(url);
		data = await response.json();
		if (data["status"] == "1") {
			wETHAddr = "0x5545153ccfca01fbd7dd11c0b23ba694d9509a6f"; // wrapped HT
			web3 = new Web3(new Web3.providers.HttpProvider("https://http-mainnet.hecochain.com/"));
			//console.log("Hecoin");
			return data;
		}
	} catch (err) {
		//console.log(err);
		//return [];
	}

	url = "https://api.hooscan.com/api?module=account&action=txlistinternal&txhash=" + txhash;
	try {
		console.log("trying hooscan: " + url);
		var response = await fetch(url);
		data = await response.json();
		if (data["status"] == "1") {
			wETHAddr = "0x3EFF9D389D13D6352bfB498BCF616EF9b1BEaC87"; // wrapped HOO
			web3 = new Web3(new Web3.providers.HttpProvider("https://http-mainnet.hoosmartchain.com/"));
			//console.log("Hoosmart");
			return data;
		}
	} catch (err) {
		//console.log(err);
		//return [];
	}


	url = "https://api.snowtrace.com/api?module=account&action=txlistinternal&txhash=" + txhash;
	try {
		console.log("trying snowtrace: " + url);
		var response = await fetch(url);
		data = await response.json();
		if (data["status"] == "1") {
			wETHAddr = "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7"; // wrapped AVAX
			web3 = new Web3(new Web3.providers.HttpProvider("https://api.avax.network/ext/bc/C/rpc"));
			//console.log("Avax-C Chain");
			return data;
		}
	} catch (err) {
		//console.log(err);
		//return [];
	}

	url = "https://api-moonbeam.moonscan.io/api?module=account&action=txlistinternal&txhash=" + txhash;
	try {
		console.log("trying moonbeam: " + url);
		var response = await fetch(url);
		data = await response.json();
		if (data["status"] == "1") {
			wETHAddr = "0xAcc15dC74880C9944775448304B263D191c6077F"; // wrapped GLMR
			web3 = new Web3(new Web3.providers.HttpProvider("https://rpc.api.moonbeam.network"));
			//console.log("Moonbeam");
			return data;
		}
	} catch (err) {
		//console.log(err);
		//return [];
	}

	url = "https://api.cronoscan.com/api?module=account&action=txlistinternal&txhash=" + txhash;
	try {
		console.log("trying cronoscan: " + url);
		var response = await fetch(url);
		data = await response.json();
		if (data["status"] == "1") {
			wETHAddr = "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23"; //wrapped CRONO
			web3 = new Web3(new Web3.providers.HttpProvider("https://evm-cronos.crypto.org"))
			//console.log("Crono");
			return data;
		}
	} catch (err) {
		//console.log(err);
		//return [];
	}

	url = "https://api-optimistic.etherscan.io/api?module=account&action=txlistinternal&txhash=" + txhash;
	try {
		console.log("trying optimistic: " + url);
		var response = await fetch(url);
		data = await response.json();
		if (data["status"] == "1") {
			//set wETHAddr to the correct address
			wETHAddr = "0x4200000000000000000000000000000000000006"; // somehow works as ETH and wrapped ETH?
			web3 = new Web3(new Web3.providers.HttpProvider("https://mainnet.optimism.io"));
			//console.log("Optimistic");
			return data;
		}
	} catch (err) {
		//console.log(err);
		//return [];
	}

	url = "https://api-moonriver.moonscan.io/api?module=account&action=txlistinternal&txhash=" + txhash;
	try {
		console.log("trying moonriver: " + url);
		var response = await fetch(url);
		data = await response.json();
		if (data["status"] == "1") {
			//set wETHAddr to the correct address
			wETHAddr = "0x98878B06940aE243284CA214f92Bb71a2b032B8A"; //wrapped MOVR
			web3 = new Web3(new Web3.providers.HttpProvider("https://rpc.moonriver.moonbeam.network"));
			//console.log("Moonriver");
			return data;
		}
	} catch (err) {
		//console.log(err);
		//return [];
	}

	url = "https://api.arbiscan.io/api?module=account&action=txlistinternal&txhash=" + txhash;
	try {
		console.log("trying arbiscan: " + url);
		var response = await fetch(url);
		data = await response.json();
		if (data["status"] == "1") {
			//set wETHAddr to the correct address
			wETHAddr = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"; //wrapped ETH
			web3 = new Web3(new Web3.providers.HttpProvider("https://arb1.arbitrum.io/rpc"));
			//console.log("Moonriver");
			return data;
		}
	} catch (err) {
		//console.log(err);
		//return [];
	}

	console.log("Unknown chain");
	//if none of the above work, we'll return an empty array
	return [];

}

async function getEthTransfers(txhash, data) {


	// data = await findNetwork(txhash);
	// console.log(data);
	if (data == [])
		return [];

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

	//findNetwork will create side-effects and change the web3 provider and wETH contract
	let data = await findNetwork(txhash);
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
		let eths = await getEthTransfers(txhash, data);
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
