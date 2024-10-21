import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { MakeFetch } from './utils.js';

const providers = [
    "flixhq", 
    "fmovies"
];
const tmdbIDs = {
    tv: [],
    movies: []
};
const skipStatuses = ["Ended", "Canceled"];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const status = JSON.parse(fs.readFileSync(path.join(__dirname, "./tmdb/status.json"), "utf-8"));

for (const provider of providers) {
    tmdbIDs.tv.push(
        ...Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, `./data/${provider}/tvmap.json`), "utf-8")))
    );

    // tmdbIDs.movies.push(
    //     ...Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, `./data/${provider}/moviesmap.json`), "utf-8")))
    // );
}

function saveStatus() {
    fs.writeFileSync(path.join(__dirname, "./tmdb/status.json"), JSON.stringify(status, null, 4));
}

function saveShow(id, data, isMovie = false) {
    fs.writeFileSync(path.join(__dirname, `./tmdb/${isMovie ? "movies" : "tv"}/${id}.json`), JSON.stringify(data, null, 4));
}

async function getSeason(id, season) {
    return [
        JSON.parse(
            await MakeFetch(
                `https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=5201b54eb0968700e693a30576d7d4dc`
            )
        ), season
    ];
}

async function getShow(id) {
    const response = JSON.parse(
        await MakeFetch(`https://api.themoviedb.org/3/tv/${id}?api_key=5201b54eb0968700e693a30576d7d4dc`)
    );

    const totalSeasons = response.number_of_seasons;
    const promises = [];

    for (let i = 1; i <= totalSeasons; i++) {
        promises.push(
            getSeason(id, i)
        );
    }

    const results = await Promise.all(promises);
    response["season_data"] = {};

    for (const result of results) {
        response["season_data"][result[1]] = result[0];
    }

    return response;
}

async function saveShowAndStatus(id) {
    const data = await getShow(id);
    status[id] = data.status;

    saveShow(id, data, false);
}

export async function ini(isMovie = false) {
    console.log(tmdbIDs["tv"].length, tmdbIDs["tv"][tmdbIDs["tv"].length - 1]);

    const key = isMovie ? "movies" : "tv";
    let promises = [];

    for (let i = 0; i < tmdbIDs[key].length; i++) {

        try {
            const id = tmdbIDs[key][i];

            if (
                (parseInt(id) === 0 || skipStatuses.includes(status[id.toString()])) &&
                i != (tmdbIDs[key].length - 1)
            ) {
                continue;
            }

            promises.push(
                saveShowAndStatus(id)
            );

            // console.log(`awaiting ${id}`);

            if (promises.length > 10 || i == (tmdbIDs[key].length - 1)) {
                await Promise.allSettled(promises);
                saveStatus();
            }

        } catch (err) {
            console.error(err);
        }
    }
}
