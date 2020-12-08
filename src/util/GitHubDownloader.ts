import * as semver from 'semver';
import * as https from 'https';
import * as path from 'path';
import * as _ from 'lodash';
import * as url from 'url';
import { IncomingHttpHeaders, IncomingMessage } from 'http';
import { fs, types, util, log } from 'vortex-api';

const gitHubAPIUrl = 'https://api.github.com/repos/z-edit/zedit';

function query(baseUrl: string, request: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const getRequest = getRequestOptions(`${baseUrl}/${request}`);
      https.get(getRequest, (res: IncomingMessage) => {
        res.setEncoding('utf-8');
        const msgHeaders: IncomingHttpHeaders = res.headers;
        const callsRemaining = parseInt(util.getSafe(msgHeaders, ['x-ratelimit-remaining'], '0'), 10);
        if ((res.statusCode === 403) && (callsRemaining === 0)) {
          const resetDate = parseInt(util.getSafe(msgHeaders, ['x-ratelimit-reset'], '0'), 10);
          const resetDateFull = (new Date(resetDate * 1000));
          log('info', 'GitHub rate limit exceeded',
            { reset_at: (resetDateFull.toString()) });
          return reject(new util.ProcessCanceled(`GitHub rate limit exceeded. Resets at: ${resetDateFull.toLocaleString()}`));
        }
  
        let output: string = '';
        res
          .on('data', data => output += data)
          .on('end', () => {
            try {
              return resolve(JSON.parse(output));
            } catch (parseErr) {
              return reject(parseErr);
            }
          });
      })
        .on('error', err => {
          return reject(err);
        })
        .end();
    });
}

function getRequestOptions(link: string) {
    const relUrl = url.parse(link);
    return ({
        ..._.pick(relUrl, ['port', 'hostname', 'path']),
        headers: {
        'User-Agent': 'Vortex',
        },
    });
}

export async function getLatestReleases(currentVersion?: string) {
      return query(gitHubAPIUrl, 'releases')
      .then((releases) => {
        if (!Array.isArray(releases)) {
          return Promise.reject(new util.DataInvalid('expected array of github releases'));
        }
        const current = releases
          .filter(rel => {
            const tagName = util.getSafe(rel, ['tag_name'], undefined);
            const isPreRelease = util.getSafe(rel, ['prerelease'], false);
            const version = semver.valid(tagName);
  
            return (!isPreRelease
              && (version !== null)
              && ((currentVersion === undefined) || (semver.gte(version, currentVersion))));
          })
          .sort((lhs, rhs) => semver.compare(rhs.tag_name, lhs.tag_name));
  
        return Promise.resolve(current);
      });
}

export async function download(context: types.IComponentContext, version: any, destination: string): Promise<string> {
    const downloadLink: string = version.assets[0].browser_download_url;
    const fileName: string = version.assets[0].name;
    const downloadNotif: types.INotification = {
        id: 'zedit-download',
        type: 'activity',
        title: 'Downloading zEdit',
        message: `${version.assets[0].name} (${formatBytes(version.assets[0].name)})`
    }

    context.api.sendNotification({
        ...downloadNotif,
        progress: 0
    });

    let redirectionURL;
    redirectionURL = await new Promise((resolve, reject) => {
        const options = getRequestOptions(downloadLink);
        https.request(options, res => {
          return (res.headers['location'] !== undefined)
            ? resolve(res.headers['location'])
            : reject(new util.ProcessCanceled('Failed to resolve download location'));
        })
          .on('error', err => reject(err))
          .end();
      });
    // Do the download
    return new Promise((resolve, reject) => {
        const options = getRequestOptions(redirectionURL);
        https.request(options, (res: IncomingMessage) => {
          res.setEncoding('binary');
          const msgHeaders: IncomingHttpHeaders = res.headers;
          const contentLength: number = parseInt(res.headers['content-length'], 10);
          const callsRemaining: number = parseInt(util.getSafe(msgHeaders, ['x-ratelimit-remaining'], '0'), 10);
          if ((res.statusCode === 403) && (callsRemaining === 0)) {
            const resetDate = parseInt(util.getSafe(msgHeaders, ['x-ratelimit-reset'], '0'), 10) * 1000;
            log('info', 'GitHub rate limit exceeded',
              { reset_at: (new Date(resetDate)).toString() });
            return reject(new util.ProcessCanceled('GitHub rate limit exceeded'));
          }

          let output = '';
          res
            .on('data', data => {
              output += data
              if (output.length % 5 === 0) {
                // Updating the notification is EXTREMELY expensive.
                //  the length % 5 === 0 line ensures this is not done too
                //  often.
                context.api.sendNotification({
                  ...downloadNotif,
                  progress: (output.length / contentLength) * 100,
                });
              }
            })
            .on('end', () => {
              context.api.sendNotification({
                ...downloadNotif,
                progress: 100,
              });
              context.api.dismissNotification(downloadNotif.id);
              return fs.writeFileAsync(path.join(destination, fileName), output, { encoding: 'binary' })
                .then(() => resolve(path.join(destination, fileName)))
                .catch(err => reject(err));
            });
        })
          .on('error', err => reject(err))
          .end();
      });

}


// This function was taken from https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}