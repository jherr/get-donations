#!/bin/bash
mkdir -p pages
while IFS=$'\t' read -r ein name
do
    # Output the first column
    curl https://projects.propublica.org/nonprofits/organizations/$ein > "pages/$ein.html"
done < <(tail -n +2 "ein-list.txt")
