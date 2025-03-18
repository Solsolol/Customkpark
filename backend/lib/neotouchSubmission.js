'use strict';

const path = require('path');		
const fs   = require('fs');
const utf8 = require('utf8');
const SOAP = require('strong-soap').soap;
var options = {};

/**
 * @class
 * 
 */
class NeotouchSubmission {

	/**
	* constructor for ODSubmission_SessionService client.
	* 
	* @access public
	*/
	constructor () {
		this.endPoint;
		this.sessionID;
	}

	/**
	* Submit Transport.
	* @param object transport ODSubmission_Transport
	* @param cb callback function.
	* @return object submissionResult ODSubmission_SubmissionResult
	* @access public
	*/
	submitTransport(transport, cb) {
		const self = this;
		var submissionResult = new ODSubmission_SubmissionResult;
		const param = { 
			transport: transport 
		};  

		// Create the SOAP client
		SOAP.createClient(path.join(__dirname, '../wsdls', 'SubmissionService2.wsdl'), options, function(soapErr, client) {
			// Define endpoint and header (sessionId)
			client.setEndpoint(self.endPoint);
			client.addSoapHeader({
				SessionHeaderValue: {
					sessionID: self.sessionID
				}
			},"","tns");
			// Call Submit function to send the document to neotouch
			client.SubmitTransport(param, function(err, response, envelope) {
				if (err) {
					throw err
				}
				
				// Get the response
				//console.log('Response Envelope: \n' + envelope);
				//console.log('Response: \n' + JSON.stringify(response));
				const result = JSON.parse(JSON.stringify(response.return));		
				// Define the result of the call				
				submissionResult.submissionID = result.submissionID;
				submissionResult.transportID = result.transportID;
				return cb(submissionResult);
			});
		});
		
		return submissionResult;
	}

	setEndpoint(endPoint) {
		this.endPoint = endPoint
	}

	setSessionID(sessionID) {
		this.sessionID = sessionID
	}

	/******************
	 *  Helper methods
	*******************/

	// Helper method to allocate and fill in Variable objects.
	static createValue(attributeName, attributeValue) {
		let value = new ODSubmission_Var();
		value.attribute = attributeName;
		value.simpleValue = utf8.encode(attributeValue);
		value.type = 'TYPE_STRING';
		return value;
	}

	// Method used to read data from a file and store them in a Web Service file object.
	static fileRead(filename) {
		let wsFile = new ODSubmission_WSFile;
		wsFile.mode = 'MODE_INLINED';
		wsFile.name = NeotouchSubmission.shortFileName(filename);
		let fileData = fs.readFileSync(filename , {encoding: 'base64'});
		wsFile.content = fileData;
		return wsFile;
	}
	
	// Helper method to extract the short file name from a full file path
	static shortFileName(filename) {
		let i = NeotouchSubmission.lastIndexOf(filename,'/');
		if(i < 0 ) i= NeotouchSubmission.lastIndexOf(filename,'\\');
		if(i < 0 ) return filename;
		return filename.substr(filename.length-i, filename.length);
	}

	// Helper method to return the last position of a search string in a source string
	static lastIndexOf(sourceString, searchString) {
		let index = (sourceString.split("").reverse().join("") + '').indexOf(searchString.split("").reverse().join(""), 0)
		return index;
	} 

	/******************
	 *  Sub Classes 
	*******************/

	/**
	 * Esker ODSubmission_Transport Object.
	 * 
	 * @access public
	 */  
	static get ODSubmission_Transport() {
		return class ODSubmission_Transport {
			constructor () {
				this.transportName;
				this.recipientType;
				this.transportIndex;
				this.nVars = 0;
				this.vars;
				this.nSubnodes = 0;
				this.subnodes;
				this.nAttachments = 0;
				this.attachments;
			}
		}
	}

	/**
	 * Esker ODSubmission_TransportVars Object.
	 * 
	 * @access public
	 */  
	static get ODSubmission_TransportVars() {
		return class ODSubmission_TransportVars {
			constructor () {
				this.Var;
			}
		}
	}

	/**
	 * Esker ODSubmission_TransportAttachments Object.
	 * 
	 * @access public
	 */  
	static get ODSubmission_TransportAttachments() {
		return class ODSubmission_TransportAttachments {
			constructor () {
				this.Attachment;
			}
		}
	}

	/**
	 * Esker ODSubmission_Attachment Object.
	 * 
	 * @access public
	 */  
	static get ODSubmission_Attachment() {
		return class ODSubmission_Attachment {
			constructor () {
				this.inputFormat;
				this.outputFormat;
				this.stylesheet;
				this.outputName;
				this.sourceAttachment;
				this.nConvertedAttachments = 0;
				this.convertedAttachments;
				this.nVars = 0;
			}
		}
	}	
}
	
/**
* Esker ODSubmission_SubmissionResult Object.
* 
* @access public
*/
class ODSubmission_SubmissionResult {
	constructor () {
		this.submissionID;
		this.transportID;
	}
}

/**
 * Esker ODSubmission_WSFile Object.
 * 
 * @access public
 */  
class ODSubmission_WSFile {
	constructor () {
		this.name;
		this.mode;
		this.content;
		this.url;
		this.storageID;   
	}
}

/**
 * Esker ODSubmission_Var Object.
 * 
 * @access public
 */
class ODSubmission_Var {
	constructor () {
		this.attribute;
		this.type;
		this.simpleValue;
		this.nValues = 0;
		this.multipleStringValues;
		this.multipleLongValues;
		this.multipleDoubleValues;
	}
}

module.exports = NeotouchSubmission;
