# Initial Idea

Project name: `aviadilo`

aircraft tracking card for Home Assistant, using free open data

ADS-B exchange globe view is awesome, and I want to create an HA card that shows the aircraft above my area.

I understand that particular data source is no longer free, but that there are alternatives which serve the same data for free. Need to keep it free, would be ideal to support multiple sources for the data

It is important that the card should be conservative on API usage to be nice to the API providers. If they limit at 1 request per second, then we do 1 request every 2 seconds.


