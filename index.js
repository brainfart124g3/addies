const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(bodyParser.json());

const rolimonsToken = process.env.token;
const robloxId = process.env.robloxId;
const config = require("./config.json");

let itemValues = {};
let playerInv = {};
let onHold = [];

async function getValuesAndAd() {
  try {
    await getValues();
    generateAd();
  } catch (error) {
    console.error("Error fetching values and generating ad:", error);
  }
}

async function getValues() {
  try {
    let response = await fetch(`https://api.rolimons.com/items/v1/itemdetails`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    let json = await response.json();
    itemValues = {};
    for (const item in json.items) {
      let type = json.items[item][5] >= 0 ? json.items[item][5] : 0;
      itemValues[item] = { value: Math.abs(json.items[item][4]), type: type };
    }
    await getInv();
  } catch (error) {
    console.error("Error fetching item details:", error);
    throw error;
  }
}

async function getInv() {
  try {
    let response = await fetch(`https://api.rolimons.com/players/v1/playerassets/${robloxId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });
    let json = await response.json();
    playerInv = json.playerAssets;
    onHold = json.holds;
  } catch (error) {
    console.error("Error fetching player inventory:", error);
    throw error;
  }
}

function findValidPairs(items, min, max) {
  const validPairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const sum = items[i].value + items[j].value;
      if (sum > min && sum < max) {
        validPairs.push([items[i], items[j]]);
      }
    }
  }
  return validPairs;
}

function generateAd() {
  let availableItems = [];
  for (const asset in playerInv) {
    for (const uaid of playerInv[asset]) {
      if (!onHold.includes(uaid) && itemValues[asset].value >= config.minItemValue && config.maxItemValue >= itemValues[asset].value && !config.sendBlacklist.includes(`${asset}`)) {
        availableItems.push(asset);
      }
    }
  }

  let sendingSideNum = Math.floor(Math.random() * (config.maxItemsSend - config.minItemsSend + 1)) + config.minItemsSend;
  let sendingSide = [];
  for (let i = 0; i < sendingSideNum; i++) {
    let item = availableItems[Math.floor(Math.random() * availableItems.length)];
    sendingSide.push(parseFloat(item));
    availableItems.splice(availableItems.indexOf(item), 1);
  }

  if (config.smartAlgo) {
    let receivingSide = [];
    let totalSendValue = sendingSide.reduce((acc, item) => acc + itemValues[item].value, 0);

    let upgOrDown = Math.floor(Math.random() * 2);
    if (upgOrDown == 1) {
      let requestValue = totalSendValue * (1 - config.RequestPercent / 100);
      let options = [];
      for (const item in itemValues) {
        if (itemValues[item].value >= requestValue && itemValues[item].value <= totalSendValue && itemValues[item].type >= config.minDemand && !sendingSide.includes(parseFloat(item))) {
          options.push(item);
        }
      }

      if (options.length >= 1) {
        let item = options[Math.floor(Math.random() * options.length)];
        receivingSide.push(parseFloat(item));
        receivingSide.push("upgrade");
        receivingSide.push("adds");
        postAd(sendingSide, receivingSide);
      } else {
        receivingSide.push("adds");
        let itemIdValArr = [];
        for (const item in itemValues) {
          if (itemValues[item].type >= config.minDemand) {
            itemIdValArr.push({ id: item, value: itemValues[item].value });
          }
        }
        let validPairs = findValidPairs(itemIdValArr, totalSendValue * (1 - config.RequestPercent / 100), totalSendValue);
        if (validPairs.length > 0) {
          const randomPair = validPairs[Math.floor(Math.random() * validPairs.length)];
          const ids = randomPair.map((item) => item.id);
          for (const id of ids) {
            receivingSide.push(parseFloat(id));
          }
          let maxRValue = Math.max(...receivingSide.filter(item => typeof item === 'number').map(item => itemValues[`${item}`].value));
          let maxSValue = Math.max(...sendingSide.filter(item => typeof item === 'number').map(item => itemValues[`${item}`].value));
          if (maxSValue < maxRValue) {
            receivingSide.push("upgrade");
          } else {
            receivingSide.push("downgrade");
          }
          postAd(sendingSide, receivingSide);
        } else {
          console.log("No valid pairs found.");
        }
      }
    } else {
      receivingSide.push("adds");
      let itemIdValArr = [];
      for (const item in itemValues) {
        if (itemValues[item].type >= config.minDemand) {
          itemIdValArr.push({ id: item, value: itemValues[item].value });
        }
      }
      let validPairs = findValidPairs(itemIdValArr, totalSendValue * (1 - config.RequestPercent / 100), totalSendValue);
      if (validPairs.length > 0) {
        const randomPair = validPairs[Math.floor(Math.random() * validPairs.length)];
        const ids = randomPair.map((item) => item.id);
        for (const id of ids) {
          receivingSide.push(parseFloat(id));
        }
        let maxRValue = Math.max(...receivingSide.filter(item => typeof item === 'number').map(item => itemValues[`${item}`].value));
        let maxSValue = Math.max(...sendingSide.filter(item => typeof item === 'number').map(item => itemValues[`${item}`].value));
        if (maxSValue < maxRValue) {
          receivingSide.push("upgrade");
        } else {
          receivingSide.push("downgrade");
        }
        postAd(sendingSide, receivingSide);
      } else {
        console.log("No valid pairs found.");
      }
    }
  } else {
    // Adding manual item selection soon
  }
}

async function postAd(sending, receiving) {
  let allRTags = [];
  let allRIds = [];

  for (const tag of receiving) {
    if (typeof tag === "string") {
      allRTags.push(tag);
    } else if (typeof tag === "number") {
      allRIds.push(tag);
    }
  }

  let seenStrings = new Set();
  const result = allRTags.filter(item => {
    if (typeof item === 'string') {
      if (seenStrings.has(item)) {
        return false;
      }
      seenStrings.add(item);
    }
    return true;
  });

  let reqBody = {
    "player_id": parseFloat(robloxId),
    "offer_item_ids": sending,
    "request_item_ids": allRIds,
    "request_tags": result
  };

  try {
    let response = await fetch(`https://api.rolimons.com/tradeads/v1/createad`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cookie": `${rolimonsToken}`
      },
      body: JSON.stringify(reqBody),
    });
    let json = await response.json();
    console.log(json);
  } catch (error) {
    console.error("Error posting trade ad:", error);
  }
}

async function startProcess() {
  try {
    await getValuesAndAd();
    setInterval(async () => {
      await getValuesAndAd();
    }, 180000); // 3 minutes in milliseconds
  } catch (error) {
    console.error("Error starting process:", error);
    process.exit(1);
  }
}

startProcess(); // Start the process

app.get("/", (req, res) => {
  res.json({ message: 'Trade ad bot is up and running!' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
