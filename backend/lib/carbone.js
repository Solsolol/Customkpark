'use strict';

const got = require('got');

/**
 * @class
 *
 */
class Carbone {
	constructor () {
		this.bearerToken = process.env.CARBONE_API_TOKEN; // Env variable of Azure
	}

	/**
	 * Function to call the render API of Carbone.io to render the document
	 * @param {string} templateId Id of the template Carbone.io
	 * @param {Object} data Object containing the data to render the template
	 * @param {string} convertFormat Format of the document to generate (pdf or excel or another)
	 * @param {object} convertOptions Object with data (values) used for the PDF conversion
	 * @returns string Return the renderId.
	 */
	async executeRenderDocument(templateId, data, convertFormat, convertOptions) {
		const self = this;

		try {			
			// Prepare URL for the HTTP POST
			const url = 'https://api.carbone.io/render/' + templateId;
			// Prepare option for the HTTP POST
			let convertToObj;
			if (convertFormat && convertOptions) {
				convertToObj = {
					formatName    : convertFormat,
					formatOptions : convertOptions
				};
			} else if (convertFormat) {
				convertToObj = convertFormat;
			} else {
				convertToObj = 'pdf';
			}
			console.debug('## convertToObj: '+convertToObj);
			
			const option = {
				json : {
					convertTo : convertToObj, // Convert the template to another file format
					data: data,
					lang: 'fr-fr',
					currencySource: 'EUR',	// String, currency of your JSON data, used by the formatter formatC
					currencyTarget: 'EUR'	// String, target currency for conversions direclty in your report
				},
				headers : {
					"Authorization": "Bearer " + self.bearerToken,					
					"Content-type": "application/json",
					"carbone-version": "4"
				}
			};
			// Call the URL
			const resp = await got.post(url, option).json();
			console.log('## resp.success: '+resp.success);
			console.log('## resp.error: '+resp.error);
			if (resp && resp.success === true && resp.data && resp.data.renderId) {
				return resp.data.renderId; 
			} else if (resp && resp.error) {
				throw new Error('### CARBONE - RenderDocument Error : ' + resp.error);
			}
		} catch (err) {
			if (err.response && err.response.body && err.response.body.error) {
				throw new Error('### CARBONE - RenderDocument Error : ' + JSON.parse(err.response.body).error);
			} else {
				throw new Error('### CARBONE - RenderDocument Error : ' + err);
			}  
		}
	}

	/**
	 * Function to call a HTTP GET to download the document
	 * @param  {string}   renderId Id of render
	 * @returns object Return the document BLOB object.
	 */
	async downloadRenderDocument(renderId) {	
		try {			
			// Prepare URL and option for the HTTP GET
			const url = 'https://api.carbone.io/render/'+renderId;
			const option = {
				responseType : "buffer"
			};
			// Call the URL		
			return await got.get(url, option).buffer(); 
		} catch (err) {
			throw new Error('### CARBONE - DownloadDocument Error : ' + err);
		}
	}
}

module.exports = Carbone;
