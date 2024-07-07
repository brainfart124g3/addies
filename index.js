/*
Made by @spiderphobias on discord. (Noor)
June 25, 2024
Made for auto posting rolimons trade ad with a smart algorithm. This is smarter and way better then any other bot. 
Open source and completely free. THIS IS NOT TO ABUSE THE SITE ROLIMONS.COM! 
Please don't spam unrealistic trades lowering the trade quality, it doesnt help you or other users!
*/

var app = require("express")(); //this is for hosting the api and putting it on uptimerobot. This helps if your server provider is bad and you want your bot to stay up.
app.use(require("body-parser").json());

const dotenv = require('dotenv'); //used for reading the secret from env. Since some hosting providers require you to have it public, this provides a safe environment keeping everything safe.
dotenv.config();

const fetch = require("node-fetch");

const rolimonsToken = process.env.token; //gets rolimons verification token from environment
const robloxId = process.env.robloxId; //gets roblox verification token from environment. I put it here since some people would like to keep their profiles private
const config = require("./config.json"); //gets your configuration

let itemValues = {}; //item values. Format is "itemId": {"value": "5", "type": "3"}
let playerInv = {}; //player current inv
let onHold = []; //items on hold

// Recursive function to start bot and handle errors
async function startBot() {
  try {
    await getValues(); // Start the process
  } catch (error) {
    console.error('Error occurred:', error);
    console.log('Restarting bot...');
    setTimeout(startBot, 5000); // Restart after 5 seconds upon encountering an error
  }
}

// function for getting item values from rolimons. This gets demand and value of the item.
async function getValues() {
  try {
    await fetch(`https://api.rolimons.com/items/v1/itemdetails`, { //https request to get the item value and demand
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }).then((res) => {
      if (!res.ok) {
        throw new Error('Failed to fetch item details');
      }
      return res.json();
    }).then((json) => {
      for (const item in json.items) {
        let type = json.items[item][5] >= 0 ? json.items[item][5] : 0;
        itemValues[item] = { value: Math.abs(json.items[item][4]), type: type }; //assings the item values and demand
      }
      //console.log(itemValues)
      getInv();
    }).catch((err) => {
      console.log(err);
      throw new Error('Failed to parse item details response');
    });
  } catch (error) {
    throw new Error('Failed to fetch item details');
  }
}

// function for getting your inventory and seeing items on hold.
async function getInv() {
  try {
    await fetch(`https://api.rolimons.com/players/v1/playerassets/${robloxId}`, { //function to get the user inventory
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    }).then((res) => {
      if (!res.ok) {
        throw new Error('Failed to fetch player inventory');
      }
      return res.json();
    }).then((json) => {
      playerInv = json.playerAssets; //gets the players inv
      onHold = json.holds; //assigns these items on hold
      //console.log(playerInv);
      //console.log(onHold);
      generateAd();
    }).catch((err) => {
      console.log(err);
      throw new Error('Failed to parse player inventory response');
    });
  } catch (error) {
    throw new Error('Failed to fetch player inventory');
  }
}

// algorithm to generate possible trade ads.
function findValidPairs(items, min, max) {
  const validPairs = []; //possible pairs/items

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

// function to decide what items to put in the ad.
function generateAd() {
  try {
    let availableItems = [];
    for (const asset in playerInv) {
      for (const uaid of playerInv[asset]) {
        if (!onHold.includes(uaid) && itemValues[asset] && itemValues[asset].value >= config.minItemValue && config.maxItemValue >= itemValues[asset].value && !config.sendBlacklist.includes(`${asset}`)) {
          availableItems.push(asset);
        }
      }
    }

    //console.log("availableItems", availableItems);

    let sendingSideNum = Math.floor(Math.random() * (config.maxItemsSend - config.minItemsSend + 1)) + config.minItemsSend;
    //console.log("Total Sending Side", sendingSideNum);
    let sendingSide = [];
    for (let i = 0; i < sendingSideNum; i++) {
      let item = availableItems[Math.floor(Math.random() * availableItems.length)];
      sendingSide.push(parseFloat(item));
      availableItems.splice(availableItems.indexOf(item), 1);
    }

    //console.log("sending Items", sendingSide);

    if (config.smartAlgo) {
      let receivingSide = [];
      let totalSendValue = 0;
      for (const item of sendingSide) {
        totalSendValue = totalSendValue + (itemValues[item] ? itemValues[item].value : 0);
      }
      //console.log("Total Send Value", totalSendValue);
      let upgOrDown = Math.floor(Math.random() * 2);
      if (upgOrDown == 1) {
        let requestValue = totalSendValue * (1 - config.RequestPercent / 100);
        let options = [];
        for (const item in itemValues) {
          if (itemValues[item] && itemValues[item].value >= requestValue && itemValues[item].value <= totalSendValue && itemValues[item].type >= config.minDemand && !sendingSide.includes(parseFloat(item))) {
            options.push(item);
          }
        }

        if (options.length >= 1) {
          let item = options[Math.floor(Math.random(options.length))];
          //console.log("upgrade Item", item);
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
          //console.log(itemIdValArr);
          let validPairs = findValidPairs(itemIdValArr, totalSendValue * (1 - config.RequestPercent / 100), totalSendValue);
          if (validPairs.length > 0) {
            const randomPair = validPairs[Math.floor(Math.random() * validPairs.length)];
            const ids = randomPair.map((item) => item.id);
            //console.log(ids);
            for (const id of ids) {
              receivingSide.push(parseFloat(id));
            }
            let maxRValue = 0
            let maxSValue = 0
            for (const item of receivingSide) {
              if (typeof item === 'number') {
                if (itemValues[`${item}`] && parseFloat(itemValues[`${item}`].value) > maxRValue) {
                  maxRValue = itemValues[`${item}`].value
                }
              }
            }
            for (const item of sendingSide) {
              if (typeof item === 'number') {
                if (itemValues[`${item}`] && parseFloat(itemValues[`${item}`].value) > maxSValue) {
                  maxSValue = itemValues[`${item}`].value
                }
              }
            }
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
        //console.log(itemIdValArr);
        let validPairs = findValidPairs(itemIdValArr, totalSendValue * (1 - config.RequestPercent / 100), totalSendValue);
        if (validPairs.length > 0) {
          const randomPair = validPairs[Math.floor(Math.random() * validPairs.length)];
          const ids = randomPair.map((item) => item.id);
          //console.log(ids);
          for (const id of ids) {
            receivingSide.push(parseFloat(id));
          }
          let maxRValue = 0
          let maxSValue = 0
          for (const item of receivingSide) {
            if (typeof item === 'number') {
              if (itemValues[`${item}`] && parseFloat(itemValues[`${item}`].value) > maxRValue) {
                maxRValue = itemValues[`${item}`].value
              }
            }
          }
          for (const item of sendingSide) {
            if (typeof item === 'number') {
              if (itemValues[`${item}`] && parseFloat(itemValues[`${item}`].value) > maxSValue) {
                maxSValue = itemValues[`${item}`].value
              }
            }
          }

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
      //adding manual item selection soon
    }
  } catch (error) {
    console.error('Error in generateAd:', error);
    throw new Error('Failed to generate trade ad');
  }
}

// function for actually posting the trade ad
async function postAd(sending, receiving) {
  try {
    let allRTags = [];
    let allRIds = [];

    console.log("Giving:", sending, "requesting", receiving);
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
    console.log(reqBody);

    const response = await fetch(`https://api.rolimons.com/tradeads/v1/createad`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cookie": `${rolimonsToken}`
      },
      body: JSON.stringify(reqBody),
    });

    if (!response.ok) {
      throw new Error('Failed to post trade ad');
    }

    const json = await response.json();
    console.log(json);
  } catch (error) {
    console.error('Error in postAd:', error);
    throw new Error('Failed to post trade ad');
  }

  setTimeout(function () {
    getValues();
  }, 300000); //you can change this timeout to every 24 mins. I did 26 mins so it doesnt overlap. Time is in milliseconds
}

startBot(); // Initialize the bot

app.get("/", (req, res) => {
  res.json({ message: 'Trade ad bot is up and running!' }); //verifies trade ad bot is up and running
});

app.listen(8080); //port to use for the api.
