// https://github.com/dagrejs/dagre-d3/wiki

function getDecimals(coin, tokens) {
	if (tokens[coin] != undefined) {
		let s = "1e" + tokens[coin]["decimals"];
		return BigNumber(s);
	}
	return BigNumber(1e18);
}

function getValue(value, coin, tokens) {
	let decimals = getDecimals(coin, tokens);
	let x = BigNumber(value);
	let temp = x.div(decimals);
	temp = BigNumber(temp.toFixed(3));
	return temp.toNumber();
}

async function getTransfers() {
	let hostname = window.location.hostname;
	let pathname = window.location.pathname;
	let _txhash = pathname.substring(4);

	console.log("Reading transaction: ", _txhash);
	console.log(hostname);

	if (_txhash.length != 66) {
		console.log("i am smol");
		return { err: "Transaction hash length not matching" };
	}

	let _url = "https://" + hostname + "/transfers/" + _txhash;
	console.log(_url);

	let response = await fetch(_url);
	let data = await response.json();
	return data;
}

async function getLinks(_data) {
	let transfers = _data["transfers"];
	let tokens = _data["tokens"];
	let nodeLabels = [];
	let nodeLabelMap = {};

	let edges = [];

	// Should we add the type of node, such that we can easily remove the ones only used in approvals

	for (let i = 0; i < transfers.length; i++) {
		let transfer = transfers[i];
		let transferAmount = transfer["amount"];
		let coin = transfer["token"].toLowerCase();
		let from = transfer["from"].toLowerCase();
		let to = transfer["to"].toLowerCase();
		let type = transfer["type"];
		edges.push({
			source: from,
			target: to,
			amount: transferAmount,
			token: coin,
			type: type,
		});

		[from, to].forEach((addr) => {
			let temp = {name: addr, type: type};
			if (nodeLabelMap[addr] == undefined || nodeLabelMap[addr]["type"] == 'approval'){
				nodeLabelMap[addr] = temp;
			}
		});

		if (nodeLabelMap[from] == undefined) {
			nodeLabels.push({ name: from });
			nodeLabelMap[from] = true;
		}
		if (nodeLabelMap[to] == undefined) {
			nodeLabels.push({ name: to });
			nodeLabelMap[to] = true;
		}
	}

	nodeLabels = [];
	Object.keys(nodeLabelMap).forEach((addr) => {
		nodeLabels.push(nodeLabelMap[addr]);
	});

	let data = {
		edges: edges,
		nodes: nodeLabels,
		tokens: tokens,
		sender: _data["sender"],
	};

	return data;
}

let addressNames = {
	"0x0000000000000000000000000000000000000000": "Address zero",
	"0x11111254369792b2ca5d084ab5eea397ca8fa48b": "1inch.exchange",
	"0x111111125434b319222cdbf8c261674adb56f3ae": "1inch.exchange v2",
	"0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH contract",
	"0x7c66550c9c730b6fdd4c03bc2e73c5462c5f7acc": "Kyber: Contract 2",
	"0x9aab3f75489902f3a48495025729a0af77d4b11e": "Kyber: Proxy 2",
	"0xd3d2b5643e506c6d9b7099e9116d7aaa941114fe": "Kyber: Fee Handler",
	"0xa5407eae9ba41422680e2e00537571bcc53efbfd": "Curve.fi: sUSD v2 Swap",
	"0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7":
		"Curve.fi: DAI/USDC/USDT Pool",
	"0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "Wrapped Ether",
	"0xc409d34accb279620b1acdc05e408e287d543d17":
		"Balancer: WBTC/renBTC/ETH 45/35/20 #2",
	"0xee9a6009b926645d33e10ee5577e9c8d3c95c165": "Balancer: WBTC/ETH 50/50 #5",
	"0x221bf20c2ad9e5d7ec8a9d1991d8e2edcfcb9d6c": "Balancer: WBTC/ETH 50/50 #9",
	"0x8b6e6e7b5b3801fed2cafd4b22b8a16c2f2db21a": "Balancer: DAI/ETH 20/80",
	"0xa478c2975ab1ea89e8196811f51a7b7ade33eb11": "Uniswap V2: DAI 2",
	"0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852": "Uniswap V2: USDT 2",
	"0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc": "Uniswap V2: USDC 3",
	"0x2fdbadf3c4d5a8666bc06645b8358ab803996e28": "Uniswap V2: YFI 8",
	"0x81fbef4704776cc5bba0a5df3a90056d2c6900b3": "Uniswap V2: renBTC 2",
	"0xbb2b8038a1640196fbe3e38816f3e67cba72d940": "Uniswap V2: WBTC 2",
	"0xceff51756c56ceffca006cd410b03ffc46dd3a58": "SushiSwap V2: WBTC",
	"0x06da0fd433c1a5d7a4faa01111c044910a184553": "SushiSwap V2: USDT",
	"0xa1d7b2d891e3a1f9ef4bbc5be20630c2feb1c470": "SushiSwap V2: SNX",
	"0x088ee5007c98a9677165d78dd2109ae4a3d04d0c": "SushiSwap: YFI",
};

function cleanName(address, tokens) {
	if (addressNames[address] != undefined) {
		return addressNames[address];
	} else if (tokens[address] != undefined) {
		return tokens[address]["symbol"];
	}
	return address;
}

function tokenName(address, tokens) {
	if (tokens[address] != undefined) {
		return tokens[address]["symbol"];
	}
	return address;
}

function drawFigure(data, _valueOnLabels, _approvals) {
	// TODO: Idea, draw numbers, and then give a list of items on the side.
	var g = new dagreD3.graphlib.Graph({ multigraph: true }).setGraph({
		rankdir: "LR",
	});
	console.log("Sender: ", data["sender"]);

	data["nodes"].forEach((node) => {
		if (!_approvals && node["type"] == 'approval'){
			return;
		}
		if (node["name"] == data["sender"]) {
			//g.setNode(node["name"], { label: "Sender" });
			let link = "https://etherscan.io/address/" + node["name"];
			let name = "sender";
			g.setNode(node["name"], {
				labelType: "html",
				label: "<a href=" + link + ">" + name + "</a>",
			});
		} else {
			let link = "https://etherscan.io/address/" + node["name"];
			let name = cleanName(node["name"], data["tokens"]);
			g.setNode(node["name"], {
				labelType: "html",
				label: "<a href=" + link + ">" + name + "</a>",
			});
		}
	});

	let count = 0;
	for (let i = 0; i < data["edges"].length; i++) {
		let edge = data["edges"][i];
		let from = edge["source"];
		let to = edge["target"];
		let token = edge["token"];
		let type = edge["type"];
		let amount = getValue(edge["amount"], token, data["tokens"]);

		if (type == "transfer" || type == "ethtransfer") {
			let link = "https://etherscan.io/address/" + token;
			let name = tokenName(token, data["tokens"]);

			g.setEdge(
				from,
				to,
				{
					labelType: "html",
					label:
						" " +
						count +
						") " +
						amount +
						" <a href=" +
						link +
						">" +
						name +
						"</a>",
				},
				count
			);
			count++;
		} else if (type == "approval") {
			if (!_approvals){
				continue;
			}
			let link = "https://etherscan.io/address/" + token;
			let name = tokenName(token, data["tokens"]);
			g.setEdge(
				from,
				to,
				{
					labelType: "html",
					label:
						" " +
						count +
						") approve " +
						amount +
						" <a href=" +
						link +
						">" +
						name +
						"</a>",
				},
				count
			);
			count++;
		}
	}

	g.nodes().forEach(function (v) {
		let node = g.node(v);
		node.rx = node.ry = 10;
	});

	var svg = d3.select("svg");
	svg.selectAll("*").remove();
	svg.append("g");
	var inner = svg.select("g");
	

	// Create the renderer
	var render = new dagreD3.render();

	// Run the renderer. This is what draws the final graph.
	render(inner, g);

	// Center the graph
/*	var initialScale = 0.75;
	svg.call(
		zoom.transform,
		d3.zoomIdentity
			.translate(
				(svg.attr("width") - g.graph().width * initialScale) / 2,
				20
			)
			.scale(initialScale)
	);

	let height =g.graph().height * initialScale;
		g.graph().height * initialScale > screen.height
			? g.graph().height * initialScale
			: screen.height;
	console.log(height, screen.height);
	//svg.attr('height', g.graph().height * initialScale);
	svg.attr("height", height);*/

	// Set up zoom support
	var zoom = d3.zoom().on("zoom", function () {
		inner.attr("transform", d3.event.transform);
	});
	svg.call(zoom);

	var graphWidth = g.graph().width + 80;
    var graphHeight = g.graph().height + 40;
    var width = parseInt(svg.style("width").replace(/px/, ""));
    var height = parseInt(svg.style("height").replace(/px/, ""));
    var zoomScale = Math.min(width / graphWidth, height / graphHeight);
    var translateX = (width / 2) - ((graphWidth * zoomScale) / 2)
    var translateY = (height / 2) - ((graphHeight * zoomScale) / 2);
	console.log(translateX, translateY);
	var svgZoom = svg.transition().duration(500);
	svgZoom.call(zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(zoomScale));	
//	svgZoom.call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
//	svgZoom.call(zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(zoomScale));	
}

var lastData;

function pleaseDraw(){
	let approvals = document.getElementById("approvals").checked;
	drawFigure(lastData, true, approvals);
}

getTransfers().then((tx) => {
	if (tx["err"]) {
		alert(tx["err"]);
		return;
	}

	if (tx == null) {
		return;
	}

	console.log(tx);

	getLinks(tx).then((data) => {
		console.log(data);
		lastData = data;
		pleaseDraw();
		//drawFigure(data, true, false);
	});
});
