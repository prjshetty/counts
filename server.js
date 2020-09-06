// server.js
// where your node app starts

// we've started you off with Express (https://expressjs.com/)
// but feel free to use whatever libraries or frameworks you'd like through `package.json`.
const express = require("express");
const app = express();
var Data = require("./data.json");
var anomalies = [];
var anomaliesInc = [];
var funcTimers = [];
var request = require("request");
function valLimit(val, max) {
  return val < max ? max : max;
}
app.set("json spaces", 2);
function Wilson(upvotes, downvotes) {
  var n = upvotes + downvotes;
  // if n == 0.0 { return 0 } will return false results
  if (upvotes == 0) {
    return 0;
  }
  var phat = upvotes / n;
  var z = 1000.0; // for 0.95 confidentiality
  var lower =
    (phat +
      (z * z) / (2 * n) -
      (z * Math.sqrt(phat * (1 - phat) + (z * z) / (4 * n))) / n) /
    (1 + (z * z) / n);
  return lower;
}
function goalManager(num) {
  if (num < 10) return 10;
  const exponent = Math.floor(Math.log10(num));
  const factor = Math.ceil(num / 10 ** exponent);
  const final = factor * 10 ** exponent;
  return final - num;
}
function clamp(val, min, max) {
  return val > max ? max : val < min ? min : val;
}
class AnomalyDetection {
    constructor (opts) {
        opts = opts || {};

        /*
            - Confidence Interval -
                1s: 68.27%
                2s: 95.45%
                3s: 99.73%   <-- default
              3.5s: 99.9534%
                4s: 99.9936%
                ... ...a
            µ ± xs: erf(x/v2)
        */
        this.confidenceInterval = opts.confidenceInterval;

        /*
            - Return Type -
            1: true / false <- default
            2: anomaly ratio [x - µ] / (conf_interval * s)
        */
        this.returnType = opts.returnType || 1;

        /*
            - Trending Factor -
            t[0] = x[1], factor: 0~1
            t[n] = t[n-1] * (1 - factor) + factor * x[n]
        */
        this.trendingFactor = opts.trendingFactor;

        this.m_n = 0;

        this.m_oldM = 0.0;
        this.m_newM = 0.0;
        this.m_oldS = 0.0;
        this.m_newS = 0.0;

        this.t_old = null;
    }

    // will reset on next push
    clear () {
        this.m_n = 0;
    }

    push (value) {
        ++this.m_n;

        const mean = this.mean();
        const standardDeviation = this.standardDeviation();

        // initialize
        if (this.m_n === 1) {
            this.m_oldM = value;
            this.m_newM = value;

            this.m_oldS = 0.0;
        } else {
            this.m_newM = this.m_oldM + (value - this.m_oldM) / this.m_n;
            this.m_newS = this.m_oldS + (value - this.m_oldM) * (value - this.m_newM);

            // set up for next iteration
            this.m_oldM = this.m_newM;
            this.m_oldS = this.m_newS;
        }

        // update trend
        this.trend(value);

        const cisd = this.confidenceInterval * standardDeviation;
        const preamble = Math.abs(value - mean);

        if (this.returnType === 1) {
            return preamble > cisd;
        }

        return preamble / cisd;
    }

    pushMeta (value) {
        const anomaly = this.push(value);

        const mean = this.mean();
        const stddev = this.standardDeviation();

        const trend = this.t_old;

        return {
            anomaly, mean, stddev, trend
        };
    }

    mean () {
        if (this.m_n > 0) {
            return this.m_newM;
        }

        return 0.0;
    }

    variance () {
        if (this.m_n > 1) {
            return this.m_newS / (this.m_n - 1);
        }

        return 0.0;
    }

    standardDeviation () {
        return Math.sqrt(this.variance());
    }

    /*
        Weighted moving average
    */

    trend (value) {
        if (this.t_old === null) {
            this.t_old = value;
        }

        let last   = this.t_old;
        let factor = this.trendingFactor;

        this.t_old = last * (1 - factor) + factor * value;

        return this.t_old;
    }
}
const TikTokScraper = require("tiktok-scraper");
/*
[
  {
    "cid": "charlidamelio",
    "_ViewCount": 0,
    "apiSubCount": 0,
    "oldAPISubCount": 0,
    "estViewGain": 0,
    "subscriberCount": 0
  }
]
Data.push({"cid":"charlidamelio","_ViewCount":"5800000000","apiSubCount":79000000,"oldAPISubCount":79000000,"estViewGain":58000000,"subscriberCount":442.5696202531607,"_duration":3});
*/
function limitNumberWithinRange(num, min, max) {
  const MIN = min || 1;
  const MAX = max || 20;
  const parsed = parseInt(num);
  return Math.min(Math.max(parsed, MIN), MAX);
}
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function _min(gain, tilldays) {
  var preCalculatedGain = gain;
  var preCalculatedScoreRatio = (gain / 86400) * 4;
  var rr = [];
  var sum = 0;
  rr.push(preCalculatedGain);
  for (var days = 1; days < tilldays; days++) {
    rr.push((preCalculatedGain + preCalculatedScoreRatio) / days);
    sum += rr[days];
  }
  //console.log(rr);
  return -Math.round(((sum / rr.length) * 4) / gain);
}
function _max(gain, tilldays) {
  var preCalculatedGain = gain;
  var preCalculatedScoreRatio = (gain / 86400) * 4;
  var rr = [];
  var sum = 0;
  rr.push(preCalculatedGain);
  for (var days = 1; days < tilldays; days++) {
    rr.push(preCalculatedGain - preCalculatedScoreRatio);
    sum += rr[days];
  }
  //console.log(rr);
  return Math.round(((sum / rr.length) * 4) / gain);
}
function getMin(gain) {
  return Math.round(_min(gain, 30));
}
function getMax(gain) {
  return Math.round(_max(gain, 30));
}
function getViewGain(ourViewCount, fromAbbr) {
  return ourViewCount / 100;
}
function random(from, to) {
  return Math.floor(Math.random() * (to - from)) + from;
}
function easing(duration, range, current) {
  return ((duration * 3) / Math.pow(range, 3)) * Math.pow(current, 2);
}

function savedata(jsonObj) {
  "use strict";

  var jsonContent = JSON.stringify(jsonObj);
  console.log(jsonContent);
  var fs = require("fs");
  fs.writeFile("data.json", jsonContent, "utf8", function(err) {
    if (err) {
      console.log("An error occured while writing JSON Object to File.");
      return console.log(err);
    }

    console.log("JSON file has been saved.");
  });
}
function pad_with_zeroes(number, len) {
  var zeroes = "9".repeat(len);
  return zeroes;
}
function padd_zeros(len) {
  return Math.round(1+new Array(len + 1).join("0").slice(-len));
}
function pad(len) {
  return Math.round(new Array(len + 1).join("9").slice(-len));
}
const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));
function toNumCalculatedAvgGain(gain, tilldays) {
  var preCalculatedGain = gain;
  var preCalculatedScoreRatio = (gain / 86400) * 4;
  var rr = [];
  var sum = 0;
  rr.push(preCalculatedGain);
  for (var days = 1; days < tilldays; days++) {
    rr.push((preCalculatedGain * preCalculatedScoreRatio));
    sum += rr[days];
  }
  //console.log(rr);
  return Math.round(sum / rr.length);
}

app.get("/youtube_estimation/:cid", function(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.params.cid == undefined) {
    console.log("lol.");
    return;
  }
  if(!Data[req.params.cid]) {
            Data[req.params.cid] = {"cid":req.params.cid,"_ViewCount":0,"apiSubCount":0,"subscriberCountTemp":5,"oldAPISubCount":0,"estViewGain":0,"subscriberCount":0,"_duration":3};
              //savedata(Data);
            }
  if (Data[req.params.cid]) {
    var gain = parseInt(Data[req.params.cid].estSubGain);
    var Gain = gain;
    var padd = pad(
      Data[req.params.cid].apiSubCount.toString().substring(3).length
    );
    var subs = clamp(Data[req.params.cid].subscriberCountTemp, -padd, padd);
    var toLimit = Math.round(Data[req.params.cid].apiSubCount + subs);
    var Min = getMin(Gain);
    var Max = getMax(Gain);
    return res.json({
      username: Data[req.params.cid].cid,
      cname: Data[req.params.cid].cname,
      cimage: Data[req.params.cid].cimage,
      subscriberCount: toLimit,
      subscriberCountAPI: Data[req.params.cid].apiSubCount,
      estSubGain: gain,
      Duration: Data[req.params.cid].duration
    });
    //{"cid":req.params.cid,"_ViewCount":0,"apiSubCount":0,"oldAPISubCount":0,"estViewGain":0,"subscriberCount":0,"_duration":3};
  }
  //Data[req.params.cid] = {"cid":req.params.cid,"_ViewCount":0,"apiSubCount":0,"oldAPISubCount":0,"estViewGain":0,"subscriberCount":0,"_duration":3};
  //return res.send('wtf.');
});
app.get("/youtube_e", function(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  var temp1 = Data;
  var temp = [];
  for (var [a, e] of Object.entries(temp1)) {
    temp.push(e);
  }
  temp.sort(
    (a, b) =>
      Math.round(b.apiSubCount + b.subscriberCount) -
      Math.round(a.apiSubCount + a.subscriberCount)
  );
  return res.json(temp);
});

app.get("/ttapi/:cid", function(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.params.cid == undefined) {
    console.log("lol.");
    return;
  }
  (async () => {
    try {
      const user = await TikTokScraper.getUserProfileInfo(req.params.cid);
      return res.json(user);
    } catch (error) {
      console.log(error);
    }
  })();
});
function getEstSubGain(ourCount, fromCount) {
  return (fromCount - ourCount);
}
function linear(duration, range, current) {
  return ((duration * 2) / Math.pow(range, 2)) * current;
}
function calculateDuration(duration, range, current) {
  return (Math.round(easing(duration, range, current)));
}
function calculate(array) {
  var i = 0,
    sum = 0,
    len = array.length;
  while (i < len) {
    sum = sum + array[i++];
  }
  return (sum / 100);
}
function calculateFullGain(array) {
  
    var sum = 0,
    len = array.length;
  for(var i = 0; i<len;i++) {
    sum = (sum + array[i]);
  }
  return ((sum / len / 1000));
}
function wait(ms) {
  //if(ms<-1) return;
  for(var i = 0; i<ms;i++) {}
}
function startCalcAvgSubs(u, val) {
  //clearInterval(funcTimers[u.cid]);
  if(u.subscriberCountTemp == null || u.subscriberCountTemp == undefined || !u.subscriberCountTemp) {
     console.log('1');
    u.subscriberCountTemp = 5;
  }
  if(u.subscriberCountTemp < -1 && u.estSubGain>=1) {
    console.log('2');
    u.subscriberCountTemp = 5;
  }
  var gain = u.estSubGain;
  var end = Math.round(pad(u.apiSubCount.toString().substring(3).length));
  var start = Math.round(u.subscriberCountTemp);
  var range = end - start;
  //u._duration -= slowDown;
  u.expires = Math.abs((u.estSubGain/100));
  var ranger = Math.abs(range / start);
  u._duration = easing(1000, range, start);
  u.duration = Math.abs((1000*(u.expires+(u._duration)))/1000);
  //u.subscriberCount = u.subscriberCount + randomNumber(getMin(u.oldAPISubCount, u.apiSubCount, gain), getMax(u.oldAPISubCount, u.apiSubCount, gain) + (gain/86400));
  funcTimers[u.cid] = setTimeout(function () {
    //wait(Math.abs(((u.lastTime)/u.estSubGain)));
    //wait(Math.abs(u._duration));
    //var gain = getEstSubGain(u.oldAPISubCount, u.apiSubCount);
    var Gain = u.estSubGain;
    //var slowGain = Math.round(((Gain)/86400)*4);
    //u.expires = Math.abs((u.estSubGain/(u.lastTime)));
    var Min = getMin(u.estSubGain);
    var Max = getMax(u.estSubGain);
    var a = u.apiSubCount;
    /*if(gain > 1) {
      u.subscriberCount = u.subscriberCount + randomNumber(getMin(u.oldAPISubCount, u.apiSubCount, gain) - u._duration, getMax(u.oldAPISubCount, u.apiSubCount, gain) - u._duration);
    //UpdateDaemon
    } else if(gain < -1) {
      u.subscriberCount = u.subscriberCount - randomNumber(getMin(u.oldAPISubCount, u.apiSubCount, gain) - u._duration, getMax(u.oldAPISubCount, u.apiSubCount, gain) - u._duration);
    }*/
    //var oldGain = Math.round(((slowGain)/86400)*4);
    console.log(u.duration);
    var newGain = random(random(Min,Max),((u.estSubGain-ranger)/86400)*Max);
    var yoyo = newGain;

    //var subscriberCount = Math.round(a+newGain);
    var easeSubCount = newGain;
    if(gain >= 1) {
       u.subscriberCountTemp += newGain;
    } else if (gain <= -1) {
       u.subscriberCountTemp -= newGain;
    }
    //u.subscriberCount += newGain;
    //u.subscriberCountTemp = u.subscriberCount / u.estSubGain;
    //u.subscriberCount += (((Min^Max)^(val))/((((Min^Max)^gain) / ((Max^Min)^gain) * ((Min^Max)^gain))/gain));
    //console.log(slowDown);
    //savedata(Data);
    //savedata(Data);
  }, u.duration);
}
// https://expressjs.com/en/starter/basic-routing.html
function UpdateDaemon1() {
  savedata(Data);
}
function updateCounters() {
  for (const [key, e] of Object.entries(Data)) {
    startCalcAvgSubs(e, 0);
  }
}
var Day = new Date().getDay();
function UpdateDaemon() {
  for (const [key, e] of Object.entries(Data)) {
    //var e = value;
    //console.log(e);
    var url = 'https://congruous-colossal-lime.glitch.me/yt_channels/'+e.cid;
    request(
      {
        method: "GET",
        url: url
      },
      function(err, response, text) {
        if (err) {
          return;
        }
        if (text.split(" ")[0] == "Missing") {
          return;
        } else if (text.split(" ")[0] == "Invalid") {
          return;
        } else if (text.split(" ")[0] == "<!DOCTYPE") {
          return;
        } else if (text.match(/.*(html).*/gm)) {
          return;
        }

                if (text.match(/.*(failed|html|DOCTYPE|invalid|missing).*/gm)) {
          return;
        }
        if(!text) {return;}
        if(text == undefined) {return;}
        var a = JSON.parse(text);
        if(!a) {return;}
        if(a.items != undefined) {
          e.cimage = a.items[0].snippet.pictures.avatar;
          e.cname = a.items[0].snippet.channel.title;
        }
        if(a.items == undefined) {
          return;
        }
        //e.cimage = a.items[0].snippet.
        if (e.apiSubCount != a.items[0].statistics.subscriberCount && e.oldAPISubCount == 0) {
          e.oldAPISubCount = a.items[0].statistics.subscriberCount;
          //e._ViewCount = a.items[0].statistics.subscriberCount;
          e.lastTime = Date.now();
          e.apiSubCount = a.items[0].statistics.subscriberCount;
        }
        var day = new Date().getDay();
        /*if(e.gainDay != day) {
          e.gainDates.push((e.apiSubCount-e.oldAPISubCount)/100);
          e.oldAPISubCount = a.items[0].statistics.subscriberCount;
          e.gainDay = day;
        }
        if(e.gainDates.length > 30) {
          e.gainDates.splice(0);
        }*/
        if(anomalies[e.cid] == undefined) {

          anomalies[e.cid] = new AnomalyDetection({confidenceInterval:2, trendingFactor: 33});
          //anomaliesInc[e.cid] = new AnomalyDetection({confidenceInterval:3.4, trendingFactor: Math.round((parseInt(e.estSubGain)/8640)*4)});
        }
        if(anomaliesInc[e.cid] == undefined) {

          anomaliesInc[e.cid] = new AnomalyDetection({confidenceInterval:4, trendingFactor: 45});
          //anomaliesInc[e.cid] = new AnomalyDetection({confidenceInterval:3.4, trendingFactor: Math.round((parseInt(e.estSubGain)/8640)*4)});
        }
        if (e.apiSubCount != a.items[0].statistics.subscriberCount) {
          e.subscriberCountTemp = 5;
          e.lastTime = Date.now();
          //e._duration = 0;
          e.apiSubCount = a.items[0].statistics.subscriberCount;
          anomalies[e.cid] = new AnomalyDetection({confidenceInterval:2, trendingFactor: 33});
          anomaliesInc[e.cid] = new AnomalyDetection({confidenceInterval:4, trendingFactor: 45});

        }
        //savedata(Data);
      }
    );
    //startCalcAvgSubs(e, Date.now() / 1000 - e.lastTime / 1000);
  }
  //savedata(Data);
}
function UpdateDaemon3() {
  for (const [key, e] of Object.entries(Data)) {
    //var e = value;
    //console.log(e);
    var url = 'https://congruous-colossal-lime.glitch.me/yt_subgains_total/'+e.cid;
    request(
      {
        method: "GET",
        url: url
      },
      function(err, response, text) {
        if (err) {
          return;
        }
        if (text.match(/.*(failed|html|DOCTYPE|invalid|missing).*/gm)) {
          return;
        }
        if(!text) {return;}
        if(text == undefined) {return;}
        var a = JSON.parse(text);
        if(!a) {return;}
        console.log(a);
        //e.gainDates = [];
        var i = 0;
        //if(e.estSubGain == undefined) {
        //calculateFullGain(array)
        //let estGain = Math.round((parseInt(u.estSubGain)/86400)*4);
        if(a.Gains == undefined) return;
        e.estSubGain = Math.round(calculateFullGain(a.Gains));
        let estGain = Math.round((parseInt(e.estSubGain)/86400)*4);
        //e.expires = Math.abs((e.estSubGain/(e.lastTime)));
        //}
      });
  }
}
const listener = app.listen(8080, () => {
  //UpdateDaemon3();
  //UpdateDaemon1();
  UpdateDaemon();
  //UpdateDaemon3();
  setInterval(UpdateDaemon3, 60000);
  setInterval(UpdateDaemon, 15000);
  setInterval(UpdateDaemon1, 50000);
  setInterval(updateCounters, 4000);
  console.log("Your app is listening on port " + listener.address().port);
});
