import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

export function ini(){
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const providers = ["flixhq", "fmovies"];
    const types = ["tvmap", "moviesmap"];
    for (const provider of providers) {
        for(const type of types){
            const data = JSON.parse(fs.readFileSync(path.join(__dirname, `./data/${provider}/${type}.json`), "utf-8"));
            for(const key in data){
                const value = data[key].toString();

                if(value === "0"){
                    continue;
                }

                fs.writeFileSync(`./pages/${provider}/${key}.txt`, value);
            }
        }
    }
}