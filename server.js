import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import { FlixHQ } from './providers/flixhq.js';
import { Fmovies } from './providers/fmovies.js';

export async function ini(provider) {
    let currentProvider = undefined;

    switch (provider) {
        case "fmovies":
            currentProvider = Fmovies;
            break;
        case "flixhq":
            currentProvider = FlixHQ;
            break;
        default:
            throw new Error("Provider not found");
    }

    const __dirname = dirname(fileURLToPath(import.meta.url));

    const movieDB = new Low(new JSONFile(join(__dirname, `./data/${currentProvider.name}/moviesmap.json`)));
    await movieDB.read();
    movieDB.data = movieDB.data || {};

    const movieErrordb = new Low(new JSONFile(join(__dirname, `./data/${currentProvider.name}/movieerror.json`)));
    await movieErrordb.read();
    movieErrordb.data = movieErrordb.data || {};

    const tvDB = new Low(new JSONFile(join(__dirname, `./data/${currentProvider.name}/tvmap.json`)));
    await tvDB.read();
    tvDB.data = tvDB.data || {};

    const tvErrordb = new Low(new JSONFile(join(__dirname, `./data/${currentProvider.name}/tvmaperror.json`)));
    await tvErrordb.read();
    tvErrordb.data = tvErrordb.data || {};


    const errorDB = new Low(new JSONFile(join(__dirname, `./data/${currentProvider.name}/error.json`)));
    await errorDB.read();
    errorDB.data = errorDB.data || [];


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

                if(currentErrorDB.data[ID].released){
                    res[1][ID].released = currentErrorDB.data[ID].released;
                }
            }
        }
    }

    async function populateReleasedDates(res, isMovie) {
        await loadErrored(res, isMovie);

        for (let i = 0; i < res[0].length; i++) {
            try {
                let link = res[1][res[0][i]].link;
                let info = await currentProvider.getInfo(link);
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
        let released = info.released;

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

            if(released){
                currentErrorDB.data[id]["released"] = released;
            }
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


        for (let i = res[0].length - 1; i >= 0; i--) {

            try {
                let info = res[1][res[0][i]];
                if (info.dateError !== true) {
                    let response = await currentProvider.mapReq(info, isMovie);
                    currentDB.data[res[0][i]] = response;
                    console.log(`Mapped ${res[0][i]} to ${response}`);
                    await deleteFromError(res[0][i], isMovie);
                    await currentDB.write();
                }
            } catch (err) {
                await addToError(res[1][res[0][i]], res[0][i], isMovie, true);
            }
        }

        await currentDB.write();
    }

    async function update(isMovie) {
        let res = [[], {}];

        let currentDB;
        if (isMovie) {
            currentDB = movieDB;
        } else {
            currentDB = tvDB;
        }

        await currentProvider.getShowsUptilID(Object.keys(currentDB.data), res, isMovie);
        if (currentProvider.requiresPopulatingReleased === true) {
            await populateReleasedDates(res, isMovie);
        }else{
            await loadErrored(res, isMovie);
        }

        await mapIDs(res, isMovie);
    }

    try {
        update(true);
        update(false);
    } catch (err) {
        console.log(err);
        fs.appendFile(join(__dirname, `./data/${currentProvider.name}/error.log`), err.toString(), (error) => {
            console.error(error);
        });
    }
}