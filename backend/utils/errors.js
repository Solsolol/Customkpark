'use strict';

/**
 * @class
 * @param {string} message The error message.
 *
 */
class GeneralError extends Error {
	constructor(message) {
		super();
		this.message = message;
	}

	getCode() {
		if (this instanceof Unauthorized) {
			return 401;
		}
		if (this instanceof BadRequest) {
			return 400;
		} 
		if (this instanceof NotFound) {
			return 404;
		}
		return 500;
	}
}

class BadRequest extends GeneralError { }
class NotFound extends GeneralError { }
class Unauthorized extends GeneralError { }

module.exports = {
	BadRequest,
	GeneralError,
	Unauthorized,
	NotFound
};