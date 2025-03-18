'use strict';

const path = require('path');
const SOAP = require('strong-soap').soap;
var options = {};

/**
 * @class
 *
 */
class NeotouchSession {

	/**
	* constructor for ODSession_SessionService client.
	* 
	* @access public
	*/
	constructor () {
		this.endPoint;
		this.sessionID;
		this.username = process.env.NEOTOUCH_LOGIN; // Env variable of Azure
		this.password = process.env.NEOTOUCH_PWD; // Env variable of Azure
	}

	/**
	* Return Bindings info.
	* 
	* @param {Function} cb Function that is called as soon as work is done or an error occurs.
	* @return object bindingResult 
	* @access public ODSession_BindingResult
	*/
	getBindings(cb) {		
		const self = this;
		var bindingResult = new ODSession_BindingResult();
		const param = { reserved: self.username };

		// Create the SOAP client
		SOAP.createClient(path.join(__dirname, '../wsdls', 'SessionService2.wsdl'), options, function(soapErr, client) {
			// Call GetBindings function to get endpoint
			client.GetBindings(param, function(err, response, envelope) {
				if (err) {
					throw err
				}				
				// Get the response
				//console.log('Response Envelope: \n' + envelope);
				//console.log('Response: \n' + JSON.stringify(response));
				const result = JSON.parse(JSON.stringify(response.return));				
				// Add this tag on returned URL in order to identify PHP client and version of PHP
				const clientType = '&ClientType=NodeKparK';
				// Define the result of the call				
				bindingResult.sessionServiceLocation = result.sessionServiceLocation;
				bindingResult.submissionServiceLocation = result.submissionServiceLocation + clientType;
				bindingResult.queryServiceLocation = result.queryServiceLocation + clientType;
				bindingResult.sessionServiceWSDL = result.sessionServiceWSDL;
				bindingResult.submissionServiceWSDL = result.submissionServiceWSDL;
				bindingResult.queryServiceWSDL = result.queryServiceWSDL;
				return cb(bindingResult);
			});
		});
	}

	/**
	* Login with username and password. will set SessionId header upon successful login.
	* 
	* @param {Function} cb Function that is called as soon as work is done or an error occurs.
	* @return mixed LoginResult complex type. (See WSDL.)
	* @access public
	*/
	login(cb){
		const self = this;
			
		var loginResult = new ODSession_LoginResult();
		const param = { 
			userName: self.username, 
			password: self.password 
		};
		
		// Configure the WS call with the endpoint
		const loginOptions = {
			endpoint : self.endPoint
		};
		// Create the SOAP client
		SOAP.createClient(path.join(__dirname, '../wsdls', 'SessionService2.wsdl'), loginOptions, function(soapErr, client) {
			//client.setEndpoint(self.endPoint);
			// Call Login function to get sessionId
			client.Login(param, function(err, response, envelope) {
				if (err) {
					throw err
				}
				// Get the response
				//console.log('Response Envelope: \n' + envelope);
				//console.log('Response: \n' + JSON.stringify(response));
				const result = JSON.parse(JSON.stringify(response.return));
				// Define the result of the call
				loginResult.sessionID = result.sessionID;
				return cb(loginResult);
			});
		});
	}

	/**
	* Logout.
	*
	* @access public
	*/
	logout(){
		const self = this;
		var param ;
			
		// Configure the WS call with the endpoint
		const loginOptions = {
			endpoint : self.endPoint
		};
		// Create the SOAP client
		SOAP.createClient(path.join(__dirname, '../wsdls', 'SessionService2.wsdl'), loginOptions, function(soapErr, client) {
			// Define header (sessionId)
			client.clearSoapHeaders(); //reinitializing headers
			client.addSoapHeader({ SessionHeaderValue: { sessionID: self.sessionID } },"","urn");
			// Call Logout function
			client.Logout(param, function(err, response, envelope) {
				if (err) {
					throw err
				}
				// Get the response
				//console.log('Response Envelope: \n' + envelope);
				//console.log('Response: \n' + JSON.stringify(response));
				console.log('## NEOTOUCH - Successfully disconnect from Neotouch');
			});
		});
	}

	setEndpoint(endPoint) {
		this.endPoint = endPoint
	}

	setSessionID(sessionID) {
		this.sessionID = sessionID
	}
}
	
/**
* Esker ODSession_BindingResult Object.
* 
* @access public
*/
class ODSession_BindingResult {
	constructor () {
		this.sessionServiceLocation;
		this.submissionServiceLocation;
		this.queryServiceLocation;
		this.sessionServiceWSDL;
		this.submissionServiceWSDL;
		this.queryServiceWSDL;
	}
}

/**
* Esker ODSession_LoginResult Object.
* 
* @access public
*/
class ODSession_LoginResult {
	constructor () {
		this.sessionID;
	}
}

module.exports = NeotouchSession;
