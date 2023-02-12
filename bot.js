import * as dotenv from "dotenv";
dotenv.config()
import fetch from 'node-fetch';
import * as eris from 'eris';

const BOT_TOKEN = process.env.BOT_TOKEN;
const TORN_API_KEY = process.env.TORN_API_KEY;
const FACTION_ID = "41066";
const FETCH_CHAIN_INTERVAL = 5000;  // 5 seconds
const FETCH_WAR_INTERVAL = 300000;  // 5 minutes
const MIN_REPORTING_MAX_CHAIN = 50;
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
	console.log("Bot connected and ready.  " + getDateStr());
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
					console.log("Found role id = " + role.id + " " + getDateStr());
				}
			});
			isReportingChain = true;
			clearAllMemory();
			console.log("STARTED in channel " + msg.channel.id + " " +  getDateStr());
			try {
				await msg.channel.createMessage(":robot: Chain reporting started in this channel only.");
			} catch (err) {
				console.warn(err);
			}
		} else if (msg.content.includes("stop")) {
			channelId = "";
			roleId = "";
			isReportingChain = false;
			console.log("STOPPED in channel " + msg.channel.id + " " +  getDateStr());
			try {
				await msg.channel.createMessage(":robot: Chain reporting stopped in all channels.");
			} catch (err) {
				console.warn(err);
			}
		} else {
			console.log("MENTIONED in channel " + msg.channel.id + " " +  getDateStr());
			try {
				let json = await fetchChain();
				if (!json || json["chain"] == undefined || json["chain"]["current"] == undefined) {
					console.warn("handle mention Failed to read json" + JSON.stringify(json) + " " +  getDateStr());
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
				let chainStr = "Chain: " + current + "/" + max + "  Timeout: " + timeoutMinutesPadded + ":" + timeoutSecondsPadded + (cooldown > 0 ? "  In cooldown" : "");
				try {
					await msg.channel.createMessage(getDateStr() + "\n" + chainStr + (isReportingChain ? "" : "\n:robot: Chain reporting is off."));
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

fetchWar();
setInterval(async () => {
	fetchWar();
}, FETCH_WAR_INTERVAL);

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
		console.warn("handleChain Empty channel ID  " + getDateStr());
		return;
	}
	if (!json) {
		console.warn("handleChain Empty json  " + getDateStr());
		return;
	}
	let channel = bot.getChannel(channelId);
	if (!channel) {
		console.warn("handleChain Failed to getChannel  " + getDateStr());
		return;
	}
	if (json["chain"] == undefined || json["chain"]["current"] == undefined) {
		console.warn("handleChain Failed to read json  " + getDateStr());
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
	let chainStr = "Chain: " + current + "/" + max + "  Timeout: " + timeoutMinutesPadded + ":" + timeoutSecondsPadded;
	let messageStr = "";

	if (cooldown > 0) {
		console.log("handleChain cooldown > 0" + chainStr + " " + cooldown);
		return;
	}

	if (lastCurrentChain != current) {
		console.log("handleChain current changed  " + getDateStr());
		twoMinutesWarned = false;
		oneMinuteWarned = false;
		lastCurrentChain = current;
	}
	if (lastMaxChain != max) {
		console.log("handleChain max changed  " + getDateStr());
		tenHitsWarned = false;
		fiveHitsWarned = false;
		twoMinutesWarned = false;
		oneMinuteWarned = false;
		lastMaxChain = max;
	}

	if (max >= MIN_REPORTING_MAX_CHAIN && timeout <= 60) { // Warn 1 minute till timeout
		if (!oneMinuteWarned) {
			oneMinuteWarned = true;
			messageStr = chainStr + "\n" + ":alarm_clock: The chain is timing out in 1 minute!";
		}
	} else if (max >= MIN_REPORTING_MAX_CHAIN && timeout <= 120) { // Warn 2 minutes till timeout
		if (!twoMinutesWarned) {
			twoMinutesWarned = true;
			messageStr = chainStr + "\n" + ":alarm_clock: The chain is timing out in 2 minutes!";
		}
	}

	if (max >= MIN_REPORTING_MAX_CHAIN && max - current <= 10) { // Warn 10 hits till bonus
		if (!fiveHitsWarned) {
			fiveHitsWarned = true;
			messageStr = chainStr + "\n" + ":chains: " + (max - current) + " hits before bonus hit!";
		}
	} else if (max >= MIN_REPORTING_MAX_CHAIN && max - current <= 20) {  // Warn 20 hits till bonus
		if (!tenHitsWarned) {
			tenHitsWarned = true;
			messageStr = chainStr + "\n" + ":chains: " + (max - current) + " hits before bonus hit!";
		}
	}

	if (messageStr != "") {
		try {
			console.log(`handleChain Sending message: [${messageStr}]`);
			await channel.createMessage((roleId == "" ? "" : "<@&" + roleId + ">  ") + getDateStr() + "\n" + messageStr);
		} catch (err) {
			console.warn(err);
		}
	} else {
		console.log(`handleChain ${current} ${max} ${timeout} ${cooldown} ${getDateStr()}`);
	}
}

function getDateStr() {  //  Example: 09:48:05
	let date = new Date(Date.now());
	let hour = date.getUTCHours().toString().length < 2 ? "0" + date.getUTCHours() : date.getUTCHours();
	let minute = date.getUTCMinutes().toString().length < 2 ? "0" + date.getUTCMinutes() : date.getUTCMinutes();
	let second = date.getUTCSeconds().toString().length < 2 ? "0" + date.getUTCSeconds() : date.getUTCSeconds();
	return "" + hour + ":" + minute + ":" + second;
}

async function fetchWar() {
	try {
		const res = await fetch(`https://api.torn.com/faction/${FACTION_ID}?selections=basic&key=${TORN_API_KEY}`);
		const json = await res.json();
		handleWar(json);
		return json;
	} catch (err) {
		console.warn(err);
	}
}

async function handleWar(json) {
	if (!channelId) {
		return;
	}
	if (!json) {
		console.warn("handleWar Empty json  " + getDateStr());
		return;
	}
	let channel = bot.getChannel(channelId);
	if (!channel) {
		console.warn("handleWar Failed to getChannel  " + getDateStr());
		return;
	}
	if (json["ranked_wars"] == undefined) {
		console.warn("handleWar Failed to read json  " + getDateStr());
		return;
	}
	let rwJson = json["ranked_wars"];
	if (Object.keys(rwJson).length <= 0 || Object.keys(rwJson)[0] == undefined) {
		console.warn("handleWar Failed to read rwJson  " + getDateStr());
		return;
	}
	let warStartTimestamp = parseInt(rwJson[Object.keys(rwJson)[0]]["war"]["start"]) * 1000;
	let countDown = warStartTimestamp - Date.now();
	if (countDown <= 0) {
		console.log("handleWar war ended " + warStartTimestamp + " " + Date.now() + getDateStr());
		return;
	}
	const hours = Math.floor(countDown / 3600000);
	const minutes = Math.floor((countDown % 3600000) / 60000);
	if ((hours == 23 && minutes >= 55 && minutes < 60) || (hours == 4 && minutes >= 55 && minutes < 60) || (hours == 0 && minutes >= 55 && minutes < 60) || (hours == 0 && minutes >= 7 && minutes < 12)) {
		try {
			let messageStr = ":crossed_swords: The Ranked War will begin in " + (hours > 0 ? "" + hours + " hours, " : "") + (minutes > 0 ? "" + minutes + " minutes." : ".");
			console.log(`handleWar Sending message: [${messageStr}]`);
			await channel.createMessage((roleId == "" ? "" : "<@&" + roleId + ">  ") + getDateStr() + "\n" + messageStr);
		} catch (err) {
			console.warn(err);
		}
	} else {
		console.log("handleWar " + hours + ":" + minutes + getDateStr());
	}
}
