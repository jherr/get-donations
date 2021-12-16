Tax Scraper
===========

Simple IRS 990 Schedule H tax scraper. Source data is from [AWS Opendata](https://registry.opendata.aws/irs990/).

# Prerequisites

This script requires Node v16.0.0 or higher. Install Node using [nvm](https://github.com/nvm-sh/nvm).

# Installation

Get the indexes data for 2017-2021. You only need to do this once. The files
are large.

```sh
./scripts/get-indexes.sh
```

Install the requisite Node modules.

```sh
npm install
```

# Execution

```sh
node getScheduleH.js
```

# Adding EINs 

Add additional EINs to the `eins.txt` file, one per line.

# Managing years

You can add to the years from the `years.txt` file by adding year numbers. Or remove years from the `years.txt` file by removing the year numbers, or by commenting out the line using the `#` comment.

# Of Indexes and Return XML files

The files listed below are the output of the `getDonations` code after the program is run with the University of Miami EIN and stored in the `cache` directory. These are exact copies of the files that are downloaded from the S3 and referenced in the indexes (described below). 

| Return XML file | Index file |
| --------------- | ---------- |
| 201441019349300004_public.xml | 2012 |
| 201531039349300443_public.xml | 2013 |
| 201600979349300030_public.xml | 2014 |
| 201721029349300107_public.xml | 2015 |
| 201811069349300841_public.xml | 2016 |
| 201900639349300210_public.xml | 2016 |
| 201901059349300415_public.xml | 2017 |
| 202001059349300920_public.xml | 2018 |
| 202131029349301403_public.xml | 2019 |

These files are listed in the indexes, which are created by `get-indexes.sh` and located in the `indexes` directory. The data in the index file is an exact copy of the data from the S3 store.

| Index file | Return XML files | Years |
| ---------- | ---------------- | ----- |
| index_2014.json | 201441019349300004_public.xml | 2012 |
| index_2015.json | 201531039349300443_public.xml | 2013 |
| index_2016.json | 201600979349300030_public.xml | 2014 |
| index_2017.json | 201721029349300107_public.xml | 2015 |
| index_2018.json | 201811069349300841_public.xml | 2016 |
| index_2019.json | 201901059349300415_public.xml, 201900639349300210_public.xml | 2016, 2017 |
| index_2021.json | 202001059349300920_public.xml | 2018 |
| index_2021.json | 202131029349301403_public.xml | 2019 |

All of these files are cached on disk strictly for performance reasons.
