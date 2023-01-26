import * as dotenv from "dotenv";
dotenv.config()
import fetch from 'node-fetch';
import * as eris from 'eris';

const BOT_TOKEN = process.env.BOT_TOKEN;
const TORN_API_KEY = process.env.TORN_API_KEY;
const FACTION_ID = "41066";
const FETCH_CHAIN_INTERVAL = 5000;  // 5 seconds

let channelId = "";
let isReportingChain = true;

const bot = new eris.Client(BOT_TOKEN);

bot.on('ready', () => {
	console.log('Connected and ready.');
});

bot.on('messageCreate', async (msg) => {
	const botWasMentioned = msg.mentions.find(
		mentionedUser => mentionedUser.id === bot.user.id,
	);
	if (botWasMentioned) {
		try {
			await msg.channel.createMessage('Present');
		} catch (err) {
			console.warn('Failed to respond to mention.');
			console.warn(err);
		}
	}
});

bot.on('error', err => {
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
		console.log("fetchChain result " + json);
		handleChain(json);
	} catch (err) {
		console.warn(err);
	}
}

function handleChain(json) {
  if (!isReportingChain) {
	  console.log("handleChain isReportingChain is false");
		return;
	}

}
