# Propublica Scraper

In the `propublica` directory. The initial input is `ein-list.txt`, which is a list of EINs we want to gather.

Run `./get-pages.sh` to download the pages from the propublic site. This will create a directory called `pages` with the downloaded HTML.

Run `./get-xmls.sh` to read the pages directoy to get all the S3 URLs by calling Propublica to get the redicts for each object ID. Then reading the S3 XML from the redirect.

After all the data has been gathered run the following commands in the root directory:

```sh
node scripts/build-mega-index.js 2015
node scripts/build-mega-index.js 2016
node scripts/build-mega-index.js 2017
node scripts/build-mega-index.js 2018
node scripts/build-mega-index.js 2019
node scripts/build-mega-index.js 2020
node scripts/build-mega-index.js 2021
```
