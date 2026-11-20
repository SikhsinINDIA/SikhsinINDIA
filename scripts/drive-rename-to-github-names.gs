/**
 * Renames the Google Drive backup copies of the site's images so each one has
 * the same file name as its copy on GitHub (sikhsinindia.com).
 *
 * The list of Drive IDs and GitHub paths comes from scripts/drive-image-map.tsv
 * in the SikhsinINDIA repository.
 *
 * How to run: script.google.com → New project → paste this file → Run
 * renameDriveImagesToMatchGitHub, signed in as the Google account that owns the
 * images. Google stops a run after about 6 minutes; if the log says
 * "Paused", just press Run again and it carries on where it stopped.
 */
function renameDriveImagesToMatchGitHub() {
  const url = 'https://raw.githubusercontent.com/SikhsinINDIA/SikhsinINDIA/main/scripts/drive-image-map.tsv';
  const rows = UrlFetchApp.fetch(url).getContentText().trim().split('\n').slice(1);
  const props = PropertiesService.getScriptProperties();
  const started = Date.now();
  let i = Number(props.getProperty('next') || 0);
  let renamed = 0, alreadyRight = 0;
  const failed = [];

  for (; i < rows.length; i++) {
    if (Date.now() - started > 5 * 60 * 1000) {
      props.setProperty('next', String(i));
      Logger.log('Paused at ' + i + ' of ' + rows.length + ' (renamed ' + renamed + ' this run). Press Run again to continue.');
      return;
    }
    const cols = rows[i].split('\t');
    const id = cols[0], path = cols[1], status = cols[3];
    if (status !== 'ok' || !path) continue;
    const name = path.split('/').pop();
    try {
      const file = DriveApp.getFileById(id);
      if (file.getName() === name) { alreadyRight++; continue; }
      file.setName(name);
      renamed++;
    } catch (e) {
      failed.push(id + '  ' + name + '  ' + e.message);
    }
  }

  props.deleteProperty('next');
  Logger.log('Finished. Renamed ' + renamed + ' this run, ' + alreadyRight + ' already had the right name, ' + failed.length + ' could not be renamed.');
  if (failed.length) Logger.log(failed.join('\n'));
}
