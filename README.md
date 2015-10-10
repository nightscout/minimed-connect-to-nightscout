# minimed-connect-to-nightscout

[MiniMed Connect] is a device which communicates with a Medtronic insulin pump over 916MHz radio to gather data about pump status. This data may include readings from an Enlite continuous glucose monitor (CGM). The Connect forwards pump data via Bluetooth LE to a [proprietary app][connect-app] running on an iPhone. The iPhone app uploads the data to Medtronic's servers, enabling authorized users to view it on the [Medtronic CareLink Connect][carelink] website.

[Nightscout] is an open source, DIY project that allows real-time access to CGM data on any platform. The core of the Nightscout project is [cgm-remote-monitor], a web service which can receive and broadcast CGM data using a Mongo database. Various other software projects communicate with an instance of `cgm-remote-monitor`, either to transmit data from a CGM device, or to display that CGM data on a computer, smartphone/tablet, or smartwatch.

**minimed-connect-to-nightscout** is a web scraper which sends data from Medtronic CareLink Connect to Nightscout. It does so by posing as a web browser, logging into CareLink Connect, periodically downloading pump status data from the Medtronic server, and uploading that data to a Nightscout server.

## Prerequisites

* A [MiniMed Connect] and compatible Medtronic insulin pump
* An iPhone running the [MiniMed Connect app][connect-app]
* Username and password for a [CareLink][carelink] account linked to the Connect
* A working Nightscout website and Mongo database

## Install

1. Install [Node].
1. Clone this repository or [download a zip] with the latest version.
1. `npm install` to install dependencies.
1. Set environment variables (see below).
1. `npm start` and leave it running.

**Coming soon:** Deploy instructions for Heroku

### Required environment variables

* `CARELINK_USERNAME` - your username for [CareLink][carelink]
* `CARELINK_PASSWORD` - your password for [CareLink][carelink]
* `CARELINK_PUMP_TIMEZONE` - a timezone offset string like `"-0700"` which represents the pump's offset from UTC (**TODO:** use time zone names like `America/Los_Angeles` instead, since offsets vary depending on DST)
* `API_SECRET` - the value you use for `API_SECRET` on your Nightscout website
* `WEBSITE_HOSTNAME` - the hostname for your Nightscout instance, which looks like `your.host.com`. If you are running this script in the same Azure environment as Nightscout, there is no need to set this, as it will [already be set by Azure][azure-environment]. If you set `NS` (see below), you do not need to set this.

### Optional environment variables

* `CARELINK_REQUEST_INTERVAL` - number of milliseconds to wait between requests to the CareLink server (default: 60000)
* `CARELINK_SGV_LIMIT` - maximum number of recent sensor glucose values to send to Nightscout (default: 24)
* `NS` - a fully-qualified Nightscout URL (e.g. `https://sitename.azurewebsites.net`) which overrides `WEBSITE_HOSTNAME`

## Currently supported data

* Sensor glucose values
* Pump: active insulin, reservoir level in units, reservoir level as percentage, battery level
* MiniMed Connect: battery level, connection status to phone, connection status to pump
* Pump model and serial number (included in all Nightscout entries)

**Potential future data**: See [this sensor-disabled gist] and [this sensor-enabled gist] for sample data provided by CareLink Connect. In particular, I'd love to include BG trend (up/down arrows) based on `lastSGTrend`. Please [get in touch] if you use an Enlite sensor and would like to help.

## Notes

[File an issue] if you'd like to give feedback, request an enhancement, or report a bug. Pull requests are welcome.

Much of the Medtronic HTTP interaction is based on the excellent work by @bewest and @ianjorgensen on [mmcsv].

## Disclaimer

This project is intended for educational and informational purposes only. It relies on a series of fragile components and assumptions, any of which may break at any time. It is not FDA approved and should not be used to make medical decisions. It is neither affiliated with nor endorsed by Medtronic, and may violate their Terms of Service.

[MiniMed Connect]: http://www.medtronicdiabetes.com/products/minimed-connect
[connect-app]: https://itunes.apple.com/us/app/minimed-connect/id999836914
[carelink]: https://carelink.minimed.com/
[Nightscout]: http://www.nightscout.info/
[cgm-remote-monitor]: https://github.com/nightscout/cgm-remote-monitor
[Node]: https://nodejs.org
[download a zip]: https://github.com/mddub/minimed-connect-to-nightscout/archive/master.zip
[azure-environment]: https://github.com/projectkudu/kudu/wiki/Azure-runtime-environment
[this sensor-disabled gist]: https://gist.github.com/mddub/b033ec0c800deec02471
[this sensor-enabled gist]: https://gist.github.com/mddub/dc1baf74eda772dcb164
[get in touch]: mailto:mark@warkmilson.com
[File an issue]: https://github.com/mddub/minimed-connect-to-nightscout/issues
[mmcsv]: https://github.com/bewest/mmcsv
