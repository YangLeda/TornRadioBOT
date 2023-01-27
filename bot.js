import * as dotenv from "dotenv";
dotenv.config()
import fetch from 'node-fetch';
import * as eris from 'eris';

const BOT_TOKEN = process.env.BOT_TOKEN;
const TORN_API_KEY = process.env.TORN_API_KEY;
const FACTION_ID = "41066";
const FETCH_CHAIN_INTERVAL = 5000;  // 5 seconds
const MIN_REPORTING_MAX_CHAIN = 25;
const ROLE_NAME = "chain alert";

let channelId = "";
let roleId = "";
let isReportingChain = false;

let lastMaxChain = 0;
let tenHitsWarned = false;
let fiveHitsWarned = false;

let lastCurrentChain = 0;
let twoMinutesWarned = false;
let oneMinuteWarned = false;

const bot = new eris.Client(BOT_TOKEN);

bot.on("ready", () => {
	console.log("Bot connected and ready." + getDateStr());
});

bot.on("messageCreate", async (msg) => {
	const botWasMentioned = msg.mentions.find(
		mentionedUser => mentionedUser.id === bot.user.id,
	);
	if (botWasMentioned) {
		if (msg.content.includes("start")) {
			channelId = msg.channel.id;
			roleId = "";
			msg.channel.guild.roles.forEach((role) => {
				if (role.name == ROLE_NAME) {
					roleId = role.id;
					console.log("Found role id = " + role.id + getDateStr());
				}
			});
			isReportingChain = true;
			clearAllMemory();
			console.log("STARTED in channel " + msg.channel.id + getDateStr());
			try {
				await msg.channel.createMessage(":robot: Chain reporting started in this channel only.");
			} catch (err) {
				console.warn(err);
			}
		} else if (msg.content.includes("stop")) {
			channelId = "";
			roleId = "";
			isReportingChain = false;
			console.log("STOPPED in channel " + msg.channel.id + getDateStr());
			try {
				await msg.channel.createMessage(":robot: Chain reporting stopped in all channels.");
			} catch (err) {
				console.warn(err);
			}
		} else {
			console.log("MENTIONED in channel " + msg.channel.id + getDateStr());
			try {
				let json = await fetchChain();
				if (!json || json["chain"] == undefined || json["chain"]["current"] == undefined) {
					console.warn("handle mention Failed to read json" + getDateStr());
					return;
				}
				let current = json["chain"]["current"];
				let max = json["chain"]["max"];
				let timeout = json["chain"]["timeout"];
				let cooldown = json["chain"]["cooldown"];
				let timeoutMinutes = Math.floor(timeout / 60);
				let timeoutSeconds = timeout - timeoutMinutes * 60;
				let timeoutMinutesPadded = timeoutMinutes.toString().length < 2 ? "0" + timeoutMinutes.toString() : timeoutMinutes.toString();
				let timeoutSecondsPadded = timeoutSeconds.toString().length < 2 ? "0" + timeoutSeconds.toString() : timeoutSeconds.toString();
				let chainStr = ":mega: Chain: " + current + "/" + max + "  Timeout: " + timeoutMinutesPadded + ":" + timeoutSecondsPadded + (cooldown > 0 ? "  In cooldown" : "");
				try {
					await msg.channel.createMessage(chainStr + getDateStr() + (isReportingChain ? "" : "\n:robot: Chain reporting is off."));
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
		console.warn("handleChain Empty channel ID" + getDateStr());
		return;
	}
	if (!json) {
		console.warn("handleChain Empty json" + getDateStr());
		return;
	}
	let channel = bot.getChannel(channelId);
	if (!channel) {
		console.warn("handleChain Failed to getChannel" + getDateStr());
		return;
	}
	if (json["chain"] == undefined || json["chain"]["current"] == undefined) {
		console.warn("handleChain Failed to read json" + getDateStr());
		return;
	}

	let current = json["chain"]["current"];
	let max = json["chain"]["max"];
	let timeout = json["chain"]["timeout"];
	let cooldown = json["chain"]["cooldown"];
	let timeoutMinutes = Math.floor(timeout / 60);
	let timeoutSeconds = timeout - timeoutMinutes * 60;
	let timeoutMinutesPadded = timeoutMinutes.toString().length < 2 ? "0" + timeoutMinutes.toString() : timeoutMinutes.toString();
	let timeoutSecondsPadded = timeoutSeconds.toString().length < 2 ? "0" + timeoutSeconds.toString() : timeoutSeconds.toString();
	let chainStr = ":mega: Chain: " + current + "/" + max + "  Timeout: " + timeoutMinutesPadded + ":" + timeoutSecondsPadded;
	let messageStr = "";

	if (cooldown > 0) {
		console.log("handleChain cooldown > 0" + chainStr + " " + cooldown + getDateStr());
		return;
	}

	if (lastCurrentChain != current) {
		console.log("handleChain current changed" + getDateStr());
		twoMinutesWarned = false;
		oneMinuteWarned = false;
		lastCurrentChain = current;
	}
	if (lastMaxChain != max) {
		console.log("handleChain max changed" + getDateStr());
		tenHitsWarned = false;
		fiveHitsWarned = false;
		twoMinutesWarned = false;
		oneMinuteWarned = false;
		lastMaxChain = max;
	}

	if (max >= MIN_REPORTING_MAX_CHAIN && timeout <= 60) { // Warn 1 minute till timeout
		if (!oneMinuteWarned) {
			oneMinuteWarned = true;
			messageStr = chainStr + "\n" + ":alarm_clock: Chain is timing out in :one: minute! Make another hit to keep the chain alive.";
		}
	} else if (max >= MIN_REPORTING_MAX_CHAIN && timeout <= 120) { // Warn 2 minutes till timeout
		if (!twoMinutesWarned) {
			twoMinutesWarned = true;
			messageStr = chainStr + "\n" + ":alarm_clock: Chain is timing out in :two: minutes! Make another hit to keep the chain alive.";
		}
	}

	if (max >= MIN_REPORTING_MAX_CHAIN && max - current <= 5) { // Warn 5 hits till bonus
		if (!fiveHitsWarned) {
			fiveHitsWarned = true;
			messageStr = chainStr + "\n" + ":reminder_ribbon: " + (max - current) + " hits till bonus hit! Make sure the bonus hit is on enemy faction.";
		}
	} else if (max >= MIN_REPORTING_MAX_CHAIN && max - current <= 10) {  // Warn 10 hits till bonus
		if (!tenHitsWarned) {
			tenHitsWarned = true;
			messageStr = chainStr + "\n" + ":reminder_ribbon: " + (max - current) + " hits till bonus hit! Make sure the bonus hit is on enemy faction.";
		}
	}

	if (messageStr != "") {
		try {
			console.log(`handleChain Sending message: [${messageStr}] | ${lastMaxChain} ${tenHitsWarned} ${fiveHitsWarned} ${lastCurrentChain} ${twoMinutesWarned} ${oneMinuteWarned} ${getDateStr()}`);
			await channel.createMessage((roleId == "" ? "" : "<@&" + roleId + "> \n") + messageStr + getDateStr());
		} catch (err) {
			console.warn(err);
		}
	} else {
		console.log(`handleChain ${current} ${max} ${timeout} ${cooldown} | ${lastMaxChain} ${tenHitsWarned} ${fiveHitsWarned} ${lastCurrentChain} ${twoMinutesWarned} ${oneMinuteWarned} ${getDateStr()}`);
	}
}

function getDateStr() {  //  Example:  TCT: 09:48:05
	let date = new Date(Date.now());
	return "  TCT: " + date.getUTCHours() + ":" + date.getUTCMinutes() + ":" + date.getUTCSeconds();
}
