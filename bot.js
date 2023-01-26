import * as dotenv from "dotenv";
dotenv.config()
import fetch from 'node-fetch';
import * as eris from 'eris';

const BOT_TOKEN = process.env.BOT_TOKEN;
const TORN_API_KEY = process.env.TORN_API_KEY;
const FACTION_ID = "41066";
const FETCH_CHAIN_INTERVAL = 5000;  // 5 seconds
const MIN_REPORTING_MAX_CHAIN = 25;

let channelId = "";
let isReportingChain = false;

let lastMaxChain = 0;
let tenHitsWarned = false;
let fiveHitsWarned = false;

let lastCurrentChain = 0;
let twoMinutesWarned = false;
let oneMinuteWarned = false;

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
			clearAllMemory();
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
				let timeoutMinutes = Math.floor(timeout / 60);
				let timeoutSeconds = timeout - timeoutMinutes * 60;
				let timeoutMinutesPadded = timeoutMinutes.toString().length < 2 ? "0" + timeoutMinutes.toString() : timeoutMinutes.toString();
				let timeoutSecondsPadded = timeoutSeconds.toString().length < 2 ? "0" + timeoutSeconds.toString() : timeoutSeconds.toString();
				let chainStr = ":mega: Chain: " + current + "/" + max + "  Timeout: " + timeoutMinutesPadded + ":" + timeoutSecondsPadded;
				try {
					await msg.channel.createMessage(chainStr + (isReportingChain ? "" : "\nChain reporting is off."));
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

function clearAllMemory() {
	lastMaxChain = 0;
	tenHitsWarned = false;
	fiveHitsWarned = false;

	lastCurrentChain = 0;
	twoMinutesWarned = false;
	oneMinuteWarned = false;
}

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
	let chainStr = ":mega: Chain: " + current + "/" + max + "  Timeout: " + timeoutMinutesPadded + ":" + timeoutSecondsPadded;
	let messageStr = "";

	if (lastCurrentChain != current) {
		twoMinutesWarned = false;
		oneMinuteWarned = false;
		lastCurrentChain = current;
	}
	if (lastMaxChain != max) {
		tenHitsWarned = false;
		fiveHitsWarned = false;
		twoMinutesWarned = false;
		oneMinuteWarned = false;
		lastMaxChain = max;
	}

	if (max >= MIN_REPORTING_MAX_CHAIN && timeout <= 60) { // Warn 1 minute till timeout
		if (!oneMinuteWarned) {
			oneMinuteWarned = true;
			messageStr = chainStr + "\n" + ":alarm_clock::alarm_clock::alarm_clock: Chain is timing out in 1 minute! Make another hit to keep the chain alive!";
		}
	} else if (max >= MIN_REPORTING_MAX_CHAIN && timeout <= 120) { // Warn 2 minutes till timeout
		if (!twoMinutesWarned) {
			twoMinutesWarned = true;
			messageStr = chainStr + "\n" + ":alarm_clock: Chain is timing out in 2 minutes! Make another hit to keep the chain alive!";
		}
	}

	if (max >= MIN_REPORTING_MAX_CHAIN && max - current <= 5) { // Warn 5 hits till bonus
		if (!fiveHitsWarned) {
			fiveHitsWarned = true;
			messageStr = chainStr + "\n" + ":reminder_ribbon::reminder_ribbon::reminder_ribbon: " +  (max - current) + " hits till bonus hit! Make sure the bonus hit is on enemy faction.";
		}
	} else if (max >= MIN_REPORTING_MAX_CHAIN && max - current <= 10) {  // Warn 10 hits till bonus
		if (!tenHitsWarned) {
			tenHitsWarned = true;
			messageStr = chainStr + "\n" + ":reminder_ribbon: " +  (max - current) + " hits till bonus hit! Make sure the bonus hit is on enemy faction.";
		}
	}

	if (messageStr != "") {
		try {
			console.log("handleChain Sending warning: " + messageStr);
			await channel.createMessage(messageStr);
		} catch (err) {
			console.warn(err);
		}
	} else {
		console.log("handleChain " + chainStr);
	}
}
