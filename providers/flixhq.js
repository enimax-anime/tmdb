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

export class FlixHQ{
    static name = "flixhq";
    static requiresPopulatingReleased = true;
    
    static async mapReq(info, movie) {
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

    static async getShowsUptilID(ids, response, movie, pageNum = 1) {
        console.log(`Getting page ${pageNum} of ${movie ? "movie" : "tv"}`);
        let IDsandLinks = await FlixHQ.fetchAndStore(pageNum, movie);
        
        for (let i = 0; i < IDsandLinks[0].length; i++) {
            let thisID = IDsandLinks[0][i];

            if (ids.includes(thisID.toString())) {
                return response;
            }

            response[0].push(thisID);
            response[1][thisID] = IDsandLinks[1][thisID];
    
        }
    
        return FlixHQ.getShowsUptilID(ids, response, movie, ++pageNum);
    }

    static async getInfo(url) {
        console.log(`Trying to fetch ${url}`);
        let data = {};
        let html = await MakeFetch(`https://www.flixhq.to${url}`);
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

    static async fetchAndStore(pageNum, movie) {
        let html = await MakeFetch(`https://www.flixhq.to/${movie ? "movie" : "tv-show"}?page=${pageNum}`);
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
    
            // tempLiIDsandLinksnk.replace("-full", "-online");
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
}
