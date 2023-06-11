import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import * as dotenv from 'dotenv';
import fs from 'fs';

dotenv.config()
const app = express();
const port = process.env.PORT;

const __dirname = dirname(fileURLToPath(import.meta.url));


const movieDB = new Low(new JSONFile(join(__dirname, 'moviesmap.json')));
await movieDB.read();
movieDB.data = movieDB.data || {};

const movieErrordb = new Low(new JSONFile(join(__dirname, 'movieerror.json')));
await movieErrordb.read();
movieErrordb.data = movieErrordb.data || {};

const tvDB = new Low(new JSONFile(join(__dirname, 'tvmap.json')));
await tvDB.read();
tvDB.data = tvDB.data || {};

const tvErrordb = new Low(new JSONFile(join(__dirname, 'tvmaperror.json')));
await tvErrordb.read();
tvErrordb.data = tvErrordb.data || {};


const errorDB = new Low(new JSONFile(join(__dirname, 'error.json')));
await errorDB.read();
errorDB.data = errorDB.data || [];


String.prototype.substringAfter = function substringAfter(toFind) {
    let str = this;
    let index = str.indexOf(toFind);
    return index == -1 ? "" : str.substring(index + toFind.length);
}

String.prototype.substringBefore = function substringBefore(toFind) {
    let str = this;
    let index = str.indexOf(toFind);
    return index == -1 ? "" : str.substring(0, index);

}

async function MakeFetch(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, 10000);

    return new Promise(function (resolve, reject) {
        fetch(url, { signal: controller.signal }).then(response => response.text()).then((response) => {
            resolve(response);
        }).catch(function (err) {
            reject(err);
        });
    });
}

async function getInfo(url) {
    console.log(`Trying to fetch ${url}`);
    let data = {};
    let html = await MakeFetch(`https://www.fmovies.ink${url}`);
    const tempDOM = new JSDOM(html).window.document;
    let info = tempDOM.querySelectorAll(".row-line");
    for (let i = 0; i < info.length; i++) {
        let text = info[i].textContent.trim();
        let key = text.substringBefore(":").trim().toLowerCase();
        let value = text.substringAfter(":").trim();
        data[key] = value;
    }

    return data;
}

async function fetchAndStore(pageNum, movie) {
    let html = await MakeFetch(`https://www.fmovies.ink/${movie ? "movie" : "tv-show"}?page=${pageNum}`);
    const tempDOM = new JSDOM(html).window.document;
    let IDs = [];
    let links = {};
    let section = tempDOM.querySelectorAll(".flw-item");
    for (var i = 0; i < section.length; i++) {
        let current = section[i];
        let poster = current.querySelector(".film-poster");
        let detail = current.querySelector(".film-detail");

        let tempLink = poster.querySelector("a").getAttribute("href");
        if (tempLink.includes("http")) {
            tempLink = (new URL(tempLink)).pathname;
        }

        tempLink.replace("-full", "-online");
        let name = detail.querySelector(".film-name").textContent.trim();
        let idSplit = tempLink.split("-");
        let id = parseInt(idSplit[idSplit.length - 1]);
        IDs.push(id);
        links[id] = {
            "link": tempLink,
            "name": name
        };
    }

    return [IDs, links];
}


async function getShowsUptilID(id, response, movie, pageNum = 1) {
    console.log(`Getting page ${pageNum} of ${movie ? "movie" : "tv"}`);
    let IDsandLinks = await fetchAndStore(pageNum, movie);

    for (let i = 0; i < IDsandLinks[0].length; i++) {
        let thisID = IDsandLinks[0][i];
        if (thisID <= id) {
            return response;
        }
        response[0].push(thisID);
        response[1][thisID] = IDsandLinks[1][thisID];

    }

    return getShowsUptilID(id, response, movie, ++pageNum);
}

async function loadErrored(res, isMovie) {
    let currentErrorDB;
    if (isMovie) {
        currentErrorDB = movieErrordb;
    } else {
        currentErrorDB = tvErrordb;
    }

    for (let ID in currentErrorDB.data) {
        if (!(ID in res[1])) {
            res[0].push(ID);
            res[1][ID] = {
                "link": currentErrorDB.data[ID].link,
                "name": currentErrorDB.data[ID].name
            }
        }
    }
}
async function populateReleasedDates(res, isMovie) {
    await loadErrored(res, isMovie);

    for (let i = 0; i < res[0].length; i++) {
        try {
            let link = res[1][res[0][i]].link;
            let info = await getInfo(link);
            if ("released" in info) {
                res[1][res[0][i]].released = info.released;
            } else {
                throw Error("Date not found");
            }
        } catch (err) {
            res[1][res[0][i]].dateError = true;
            await addToError(res[1][res[0][i]], res[0][i], isMovie, false);
        }
    }
}

async function mapReq(info, movie) {
    let year = (new Date(info.released)).getFullYear();
    let urlAPI = `https://api.themoviedb.org/3/search/${movie ? "movie" : "tv"}?api_key=${process.env.KEY}&query=${info.name}&page=1&primary_release_year=${year}`;
    let releaseDateProperty = "release_date";

    if (!movie) {
        releaseDateProperty = "first_air_date";
    }

    let searchRes = JSON.parse(await MakeFetch(urlAPI));
    if (searchRes.length == 0) {
        return 0;
    }
    else if (searchRes.length == 1) {
        return searchRes[0].id;
    }

    for (let i = 0; i < searchRes.results.length; i++) {
        let curResult = searchRes.results[i];
        if (curResult[releaseDateProperty] == info.released) {
            return curResult.id;
        }
        let date = new Date(curResult[releaseDateProperty]);
        let flixDate = new Date(info.released);
        // a month in milliseconds
        if (Math.abs(date.getTime() - flixDate.getTime()) < 2629746 * 1000) {
            return curResult.id;
        }
    }

    return 0;
}
async function deleteFromError(id, isMovie) {
    let currentErrorDB;
    if (isMovie) {
        currentErrorDB = movieErrordb;
    } else {
        currentErrorDB = tvErrordb;
    }

    if (id in currentErrorDB.data) {
        delete currentErrorDB.data[id];
        await currentErrorDB.write();
    }
}

async function addToError(info, id, isMovie, mapError = true) {
    let currentErrorDB;
    if (isMovie) {
        currentErrorDB = movieErrordb;
    } else {
        currentErrorDB = tvErrordb;
    }


    let exists = id in currentErrorDB.data;
    let link = info.link;
    let name = info.name;
    if (exists) {
        currentErrorDB.data[id][mapError ? "mapErrored" : "errored"]++;
        if (currentErrorDB.data[id].errored > 10 || currentErrorDB.data[id].mapErrored > 10) {
            errorDB.data.push(currentErrorDB.data[id]);
            await errorDB.write();
            deleteFromError(id, isMovie);
        }
    } else {
        currentErrorDB.data[id] = {
            link,
            name,
            errored: mapError ? 0 : 1,
            mapErrored: mapError ? 1 : 0
        };
    }
    await currentErrorDB.write();
}

async function mapIDs(res, isMovie) {
    let currentDB;
    if (isMovie) {
        currentDB = movieDB;
    } else {
        currentDB = tvDB;
    }


    let maxID = Math.max(...res[0]);
    for (let i = 0; i < res[0].length; i++) {

        try {
            let info = res[1][res[0][i]];
            if (info.dateError !== true) {
                let response = await mapReq(info, isMovie);
                currentDB.data[res[0][i]] = response;
                console.log(`Mapped ${res[0][i]} to ${response}`);
                await deleteFromError(res[0][i], isMovie);
                await currentDB.write();
            }
        } catch (err) {
            await addToError(res[1][res[0][i]], res[0][i], isMovie, true);
        }
    }

    if (maxID && isFinite(maxID) && maxID > currentDB.data["maxID"]) {
        currentDB.data["maxID"] = maxID;
        await currentDB.write();
    }
}

async function update(isMovie) {
    let res = [[], {}];

    let currentDB;
    if (isMovie) {
        currentDB = movieDB;
    } else {
        currentDB = tvDB;
    }

    await getShowsUptilID(currentDB.data.maxID, res, isMovie);
    await populateReleasedDates(res, isMovie);
    await mapIDs(res, isMovie);
}

function runUpdate(){
    try {
        update(true);
        update(false);
    } catch (err) {
        console.log(err);
        fs.appendFile("error.log", err.toString(), (error) => {
            console.error(error);
        });
    }
}

// Runs every hour
setInterval(function () {
    runUpdate();
}, 3600000);

runUpdate();





app.get('/tv', async (req, res) => {
    if ("id" in req.query && req.query.id in tvDB.data) {
        let id = tvDB.data[req.query.id].toString();
        let response = "";
        try {
            response = await MakeFetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${process.env.KEY}`);
            res.status(200).send(response);
        } catch (err) {
            response = "Error";
            res.status(500).send(response);

        }
    } else {
        res.status(404).send("ID not found.");
    }
});

app.get('/tv/season', async (req, res) => {
    if ("id" in req.query && "season" in req.query && req.query.id in tvDB.data) {
        let id = tvDB.data[req.query.id].toString();
        let response = "";
        try {
            response = await MakeFetch(`https://api.themoviedb.org/3/tv/${id}/season/${req.query.season}?api_key=${process.env.KEY}`);
            res.status(200).send(response);
        } catch (err) {
            response = "Error";
            res.status(500).send(response);

        }
    } else {
        res.status(404).send("ID not found.");
    }
});


app.get('/movies', async (req, res) => {
    if ("id" in req.query && req.query.id in movieDB.data) {
        let id = movieDB.data[req.query.id].toString();
        let response = "";
        try {
            response = await MakeFetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${process.env.KEY}`);
            res.status(200).send(response);
        } catch (err) {
            response = "Error";
            res.status(500).send(response);

        }
    } else {
        res.status(404).send("ID not found.");
    }
});

app.get('/dump/tv', async (req, res) => {
    res.status(200).json(tvDB.data);
});

app.get('/dump/tverror', async (req, res) => {
    res.status(200).json(tvErrordb.data);
});

app.get('/dump/movie', async (req, res) => {
    res.status(200).json(movieDB.data);
});

app.get('/dump/movieerror', async (req, res) => {
    res.status(200).json(movieErrordb.data);
});

app.get('/dump/error', async (req, res) => {
    let logs = "";
    try{
        logs = fs.readFileSync("error.log").toString();
    }catch(err){
        logs = err.toString();
    }
    res.status(200).send(logs);
});

app.get('/dump/error.json', async (req, res) => {
    res.status(200).json(errorDB.data);
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
});
