// third-party
const Bluebird = require('Bluebird');
const flatten  = require('array-flatten');

const aux = require('./auxiliary');

function _toArray(obj) {
  return Array.prototype.slice.call(obj, 0);
}

/**
 * Enforces the FileDataObject interface.
 * @param  {HTML5 File} file     [description]
 * @param  {String} basePath [description]
 * @return {FileDataObject}
 *         A meta object with extra data on the file
 */
function _buildFileDataObject(file, basePath) {

  var filePath = basePath ? basePath + '/' + file.name : file.name;

  return {
    lastModified: file.lastModified,
    name: file.name,
    size: file.size,
    path: filePath,
    file: file,
  };
}

/**
 * Reads data from a file entry
 * @param  {FileEntry} fileEntry    [description]
 * @param  {String} basePath The path on which the file sits
 * @return {Promise -> FileDataObject}          [description]
 */
function _parseFileEntry(fileEntry, basePath) {
  return new Bluebird(function (resolve, reject) {
    fileEntry.file(function (file) {

      var fData = _buildFileDataObject(file, basePath);

      resolve(fData);

    }, reject);
  });
}

/**
 * Parses data from a directoryEntry
 * @param  {DirectoryEntry} directoryEntry [description]
 * @param  {String} basePath       [description]
 * @return {Promise -> Array of FileDataObjects}                [description]
 */
function _parseDirectoryEntry(directoryEntry, basePath, options) {

  options = options || {};

  // add stuff to base path
  if (options._isRoot) {
    // consider the directory the root, so
    // do not add its name to the basepath
    basepath = '';

  } else {

    if (basePath) {
      basePath += '/' + directoryEntry.name;
    } else {
      basePath = directoryEntry.name;
    }
  }

  return new Bluebird(function (resolve, reject) {

    // get directory contents
    var directoryReader = directoryEntry.createReader();

    // we must call read entries recursively untill 
    // an empty array is returned
    // https://developer.mozilla.org/en-US/docs/Web/API/DirectoryReader
    
    var directorySubEntries = [];

    // Keep calling readEntries() until no more results are returned.
    var _readSubEntries = function() {
       directoryReader.readEntries(function(results) {

        // console.log('directory %s', basePath, results);

        if (!results.length) {
          // no more results, 
          var entryFilePromises = directorySubEntries.map(function (subEntry) {
            return _parseWebkitEntry(subEntry, basePath);
          });

          Bluebird.all(entryFilePromises)
            .then(function (entryFiles) {
              resolve(flatten(entryFiles));
            }, function (err) {
              reject(err);
            });

        } else {
          // not yet reached the end,
          // add sub entries to the array and
          // continue reading
          directorySubEntries = directorySubEntries.concat(_toArray(results));
          _readSubEntries();
        }
      }, reject);
    };

    _readSubEntries();

  });

}

/**
 * Checks which parser to use (file or directory)
 * @param  {Entry} entry    [description]
 * @param  {String} basePath [description]
 * @return {[type]}          [description]
 */
function _parseWebkitEntry(entry, basePath) {
  if (entry.isFile) {
    return _parseFileEntry(entry, basePath);
  } else if (entry.isDirectory) {
    return _parseDirectoryEntry(entry, basePath);
  }
}

/**
 * Reads files from a drop event
 */
function webkitFromDropEvent(e, filterFn) {
  var items = Array.prototype.slice.call(e.dataTransfer.items, 0);

  // variable that holds the root directory of the drop event
  var rootDir = '';

  var parsePromises = items.map(function (item) {

    var entry = item.webkitGetAsEntry();

    if (entry.isDirectory && items.length === 1) {
      // dropping single directory
      rootDir = entry.name;

      return _parseDirectoryEntry(entry, '', { _isRoot: true });
    } else {

      if (entry.isDirectory) {
        return _parseDirectoryEntry(entry, '', { _isRoot: false });
      } else {
        return _parseFileEntry(entry, '');
      }
    }
  });

  return Bluebird.all(parsePromises)
    .then(function (files) {

      // flatten deep array
      files = flatten(files);

      // check if there is a filter function
      if (typeof filterFn === 'function') {
        files = files.filter(filterFn);
      }

      return {
        rootDir: rootDir,
        files: files
      };

    });
}

/**
 * For non webkit, we must ensure the selected file is a single zip file
 * @param  {HTMLDropEvent} e        [description]
 * @param  {Function} filterFn [description]
 * @return {Promise}          [description]
 */
function nonWebkitFromDropEvent(e, filterFn) {
  var dt = e.dataTransfer;
  var files = Array.prototype.slice.call(dt.files, 0);

  var basePath = '';

  files = files.map(function (file) {
    return _buildFileDataObject(file, basePath);
  });

  return Bluebird.resolve({
    rootDir: '',
    files: files
  });
}

function fromDirectoryInput(input) {

  var sourceFiles = input.files;
  sourceFiles = Array.prototype.slice.call(sourceFiles, 0);

  // parse out the root directory
  var rootDir = sourceFiles[0].webkitRelativePath.split('/')[0];

  var files = sourceFiles.map(function (sourceFile) {
    return {
      lastModified: sourceFile.lastModified,
      name: sourceFile.name,
      size: sourceFile.size,
      path: sourceFile.webkitRelativePath.replace(rootDir + '/', ''),
      file: sourceFile,
    };
  });

  return Bluebird.resolve({
    rootDir: rootDir,
    files: files
  });
}

function fromFileInput(input) {

  var sourceFiles = input.files;
  sourceFiles = Array.prototype.slice.call(sourceFiles, 0);

  var files = sourceFiles.map(function (sourceFile) {
    return {
      lastModified: sourceFile.lastModified,
      name: sourceFile.name,
      size: sourceFile.size,
      path: sourceFile.name,
      file: sourceFile,
    };
  });

  return Bluebird.resolve({
    rootDir: '',
    files: files
  });

}

exports.fromDropEvent      = aux.isChrome() ? webkitFromDropEvent : nonWebkitFromDropEvent;
exports.fromDirectoryInput = fromDirectoryInput;
exports.fromFileInput      = fromFileInput;
