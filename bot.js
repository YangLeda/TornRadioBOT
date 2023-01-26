import * as dotenv from "dotenv";
dotenv.config()
import fetch from 'node-fetch';
import * as eris from 'eris';

const BOT_TOKEN = process.env.BOT_TOKEN;
const TORN_API_KEY = process.env.TORN_API_KEY;
const FACTION_ID = "41066";
const FETCH_CHAIN_INTERVAL = 5000;  // 5 seconds

let channelId = "";
let isReportingChain = false;

const bot = new eris.Client(BOT_TOKEN);

bot.on("ready", () => {
	console.log("Connected and ready.");
});

bot.on("messageCreate", async (msg) => {
	const botWasMentioned = msg.mentions.find(
		mentionedUser => mentionedUser.id === bot.user.id,
	);
	if (botWasMentioned) {
		if (msg.content.includes("start")) {
			channelId = msg.channel.id;
			isReportingChain = true;
			console.log("STARTED Mentioned start in channel " + msg.channel.id);
			try {
				await msg.channel.createMessage("Chain reporting started in this channel.");
			} catch (err) {
				console.warn(err);
			}
		} else if (msg.content.includes("stop")) {
			channelId = "";
			isReportingChain = false;
			console.log("STOPPED Mentioned stop in channel " + msg.channel.id);
			try {
				await msg.channel.createMessage("Chain reporting stopped in all channel.");
			} catch (err) {
				console.warn(err);
			}
		} else {
			console.log("MENTIONED in channel " + msg.channel.id);
			try {
				let json = await fetchChain();
				if (!json || json["chain"] == undefined || json["chain"]["current"] == undefined) {
					console.warn("handle mention Failed to read json");
					return;
				}
				let current = json["chain"]["current"];
				let max = json["chain"]["max"];
				let timeout = json["chain"]["timeout"];
				try {
					await msg.channel.createMessage("Chain: " + current + "/" + max + "  Timeout: " + timeout + (isReportingChain ? "\nChain reporting is on." : "\nChain reporting is off."));
				} catch (err) {
					console.warn(err);
				}
			} catch (err) {
				console.warn(err);
			}
		}
	}
});

bot.on("error", err => {
	console.warn(err);
});

bot.connect();


fetchChain();
setInterval(async () => {
	fetchChain();
}, FETCH_CHAIN_INTERVAL);

async function fetchChain() {
	try {
		const res = await fetch(`https://api.torn.com/faction/${FACTION_ID}?selections=chain&key=${TORN_API_KEY}`);
		const json = await res.json();
		handleChain(json);
		return json;
	} catch (err) {
		console.warn(err);
	}
}

async function handleChain(json) {
	if (!isReportingChain) {
		return;
	}
	if (!channelId) {
		console.warn("handleChain Empty channel ID");
		return;
	}
	if (!json) {
		console.warn("handleChain Empty json");
		return;
	}
	let channel = bot.getChannel(channelId);
	if (!channel) {
		console.warn("handleChain Failed to getChannel");
		return;
	}
	if (json["chain"] == undefined || json["chain"]["current"] == undefined) {
		console.warn("handleChain Failed to read json");
		return;
	}

	let current = json["chain"]["current"];
	let max = json["chain"]["max"];
	let timeout = json["chain"]["timeout"];
	let timeoutMinutes = Math.floor(timeout / 60);
	let timeoutSeconds = timeout - timeoutMinutes * 60;
	let timeoutMinutesPadded = timeoutMinutes.toString().length < 2 ? "0" + timeoutMinutes.toString() : timeoutMinutes.toString();
	let timeoutSecondsPadded = timeoutSeconds.toString().length < 2 ? "0" + timeoutSeconds.toString() : timeoutSeconds.toString();

	try {
		await channel.createMessage("Chain: " + current + "/" + max + "  Timeout: " + timeoutMinutesPadded + ":" + timeoutSecondsPadded);
	} catch (err) {
		console.warn(err);
	}
}
