'use strict';

requirejs.config({
	paths: {
		postmonger: 'postmonger'
	},
	shim: {
		'jquery.min': {
			exports: '$'
		},
		'../postalMailActivity': {
			deps: ['jquery.min', 'postmonger']
		}
	}
});

requirejs(['jquery.min', '../postalMailActivity'], function ($, customEvent) {
});

requirejs.onError = function (err) {
	if (err.requireType === 'timeout') {
		console.log('modules: ' + err.requireModules);
	}
	throw err;
};
