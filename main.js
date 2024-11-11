import * as tmdb from "./tmdb.js";
import * as server from "./server.js";
import * as parse from "./parse.js";
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "node:child_process";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let last = JSON.parse(readFileSync(path.join(__dirname, "./last.json"), "utf-8"));

function updateLast(){
    writeFileSync(path.join(__dirname, "last.json"), JSON.stringify(last));
}

function updateRepo() {
    const response = spawnSync(path.join(__dirname, "./update.sh"));
    
    if(response.error){
        throw response.error;
    }

    console.log(response.stdout?.toString());
}

async function updateTMDB() {
    try {
        const currentTime = Date.now();
        console.log(last);
        // A week
        if ((currentTime - last.time) > (60 * 60 * 24 * 7 * 1000)) {
            switch(last.stage){
                case 0:
                    console.log("Starting stage 0");
                    await tmdb.ini();
                    last.stage = 1;
                    updateLast();
                    console.log("Done with stage 0");
                case 1:
                    console.log("Starting stage 1");
                    parse.ini();
                    last.stage = 2;
                    updateLast();
                    console.log("Done with stage 1");
                case 2:
                    console.log("Starting stage 2");
                    updateRepo();
                    last.stage = 0;
                    last.time = currentTime;
                    updateLast();
                    console.log("Done with stage 2");
            }
        }
    } catch (err) {
        console.error(err);
    }
}

setInterval(() => {
    server.ini("fmovies");
    server.ini("flixhq");
}, 60 * 60 * 1000);
// 1 hour


setInterval(async () => {
    updateTMDB();
}, 60 * 60 * 1 * 1000);
// 1 hour

updateTMDB();
server.ini("fmovies");
server.ini("flixhq");
