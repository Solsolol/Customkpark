'use strict';

const path = require('path');
const { GeneralError } = require(path.join(__dirname, '../utils', 'errors.js'));

const handleErrors = (err, req, res, next) => {
	console.error(err);
	if (err instanceof GeneralError) {
		return res.status(err.getCode()).json({
			status: 'error',
			message: err.message
		});
	}

	return res.status(500).json({
		status: 'error',
		message: err.message
	});
}

module.exports = handleErrors;