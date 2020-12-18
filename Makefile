
MOCHA=./node_modules/.bin/mocha --timeout 15000

test:
	MMCONNECT_SERVER=EU ${MOCHA} test/connectEu.js
	MMCONNECT_COUNTRYCODE=us ${MOCHA} test/connectUs.js
	${MOCHA} test/integration.js
	${MOCHA} test/filter.js
	${MOCHA} test/transform.js
	${MOCHA} test/multitenant.js
.PHONY: test
