'use strict';

const util = require("util");
const multer = require("multer");
const maxSize = 50 * 1024 * 1024; // File size = 50Mb

// Prepare and configure the multer object to use the memory and get multiple files
const storage = multer.memoryStorage();
let uploadFiles = multer({
    storage: storage,
    limits: { fileSize: maxSize },
    fileFilter: fileFilter
}).array("file");

/**
* Function to filter files to get only PDF.
* @param {object} req Object of the request
* @param {object} file Objet of the file uploded.
* @param {Function} cb Function that is called as soon as work is done or an error occurs.
* @access public
*/
function fileFilter (req, file, cb) {
    const allowed = ['application/pdf'];
    // The function should call `cb` with a boolean
    // to indicate if the file should be accepted
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(null, false); // handle error in middleware, not here
    }
}

let uploadFileMiddleware = util.promisify(uploadFiles);

module.exports = uploadFileMiddleware;