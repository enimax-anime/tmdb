import fetch from 'node-fetch';

export async function MakeFetch(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, 10000);

    return new Promise(function (resolve, reject) {
        fetch(url, { signal: controller.signal }).then(response => response.text()).then((response) => {
            resolve(response);
        }).catch(function (err) {
            reject(err);
        }).finally(() => {
            clearTimeout(timeout);
        });
    });
}
