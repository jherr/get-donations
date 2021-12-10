Tax Scraper
===========

Simple IRS 990 Schedule H tax scraper.

# Prerequisites

This script requires Node v16.0.0 or higher. Install Node using [nvm](https://github.com/nvm-sh/nvm).

# Installation

Get the indexes data for 2017-2021. You only need to do this once. The files
are large.

```sh
./get-indexes.sh
```

Install the requisite Node modules.

```sh
npm install
```

# Execution

```sh
node getDonations.js
```

# Adding EINs 

Add additional EINs to the `eins.txt` file, one per line.
