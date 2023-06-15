#!/bin/bash

remove_carriage_return() {
  local string="$1"
  echo "${string%$'\r'}"
}

backslash_escape() {
  local string="$1"
  printf "%q" "$string"
}

mkdir -p xml

grep -oE '/nonprofits/download-xml\?object_id=[0-9]+' pages/*.html | cut -d'=' -f2 > objectids.txt

while IFS= read -r line
do
  output=$(curl -s --head "https://projects.propublica.org/nonprofits/download-xml?object_id=${line}")
  location_header=$(echo "$output" | awk -F': ' '/location:/ {print $2}')

  clean_url=$(remove_carriage_return "$location_header")
#   url=$(backslash_escape "$clean_url")
  echo $clean_url
  curl "${clean_url}" > "xml/${line}_public.xml"
done < "objectids.txt"

rm objectids.txt
