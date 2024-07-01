import { readFileSync, readdirSync, writeFileSync } from "fs";

for(const file of readdirSync("./tmdb/tv")){
    const filePath = "./tmdb/tv/" + file;

    writeFileSync(
        filePath,
        JSON.stringify(JSON.parse(readFileSync(filePath, "utf-8")))
    );
}
