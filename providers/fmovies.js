import { JSDOM } from 'jsdom';
import { MakeFetch } from '../utils.js';
import * as dotenv from 'dotenv';

dotenv.config();

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

export class Fmovies{
    static name = "fmovies";
    static requiresPopulatingReleased = false;
    
    static async mapReq(info, movie) {
        console.log(info.released);
        let year = parseInt(info.released);

        if(isNaN(year)){
            throw new Error("NaN year");
        }

        let urlAPI = `https://api.themoviedb.org/3/search/${movie ? "movie" : "tv"}?api_key=${process.env.KEY}&query=${info.name}&page=1&primary_release_year=${year}`;
        console.log(urlAPI);
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
            if (curResult[releaseDateProperty] == year) {
                return curResult.id;
            }
            let date = new Date(curResult[releaseDateProperty]);

            console.log(date.getFullYear(), )
            if (date.getFullYear() === year) {
                return curResult.id;
            }
        }

        return 0;
    }

    static async getShowsUptilID(ids, response, movie, pageNum = 1) {
        console.log(`Getting page ${pageNum} of ${movie ? "movie" : "tv"}`);
        let IDsandLinks = await Fmovies.fetchAndStore(pageNum, movie);

        if(IDsandLinks[0].length === 0){
            return response;
        }
        

        for (let i = 0; i < IDsandLinks[0].length; i++) {
            let thisID = IDsandLinks[0][i];

            if (ids.includes(thisID.toString())) {
                return response;
            }

            response[0].push(thisID);
            response[1][thisID] = IDsandLinks[1][thisID];
    
        }
    
        return Fmovies.getShowsUptilID(ids, response, movie, ++pageNum);
    }

    static async fetchAndStore(pageNum, movie) {
        let html = await MakeFetch(`https://fmovies.ps/${movie ? "movie" : "tv"}?page=${pageNum}`);
        const tempDOM = new JSDOM(html).window.document;
        let IDs = [];
        let links = {};
        
        let section = tempDOM.querySelectorAll(".items.movies .item");

        for (var i = 0; i < section.length; i++) {
            const current = section[i];
            const id = current.querySelector("a").getAttribute("href").split("-").pop();
            
            IDs.push(id);

            links[id] = {
                "link": current.querySelector("a").getAttribute("href"),
                "name": current.querySelector(".meta a").textContent.trim(),
                "released": current.querySelector(".meta").querySelector("span").textContent.trim()
            };
        }

        return [IDs, links];
    }
}
