#!/bin/bash

# Test first 20 streams from live_streams.sii
declare -a urls=(
  "http://ice-the.musicradio.com:80/LBC973MP3Low"
  "http://media-ice.musicradio.com/SmoothLondonMP3"
  "http://ice.abradio.cz/faktor128.mp3"
  "http://streaming.radiodresden.de/radio-dresden_simulcast_192k_mp3"
  "http://stream.sepia.sk:8000/viva128.mp3"
  "http://live-icy.gss.dr.dk:8000/A/A25H.mp3"
  "http://broadcast.infomaniak.ch/ouifm-high.mp3"
  "http://icecast.vrtcdn.be/stubru-high.mp3"
  "http://s1.slotex.pl:7390/stream/1/"
  "http://icy-e-04.sharp-stream.com/tcnation.mp3"
  "http://www.netiraadio.ee:8000/teistsugune"
  "http://audiostream.rtl.be/mint"
  "http://mainstream.radioagora.pl:80/tuba8-1.mp3"
  "http://nashe1.hostingradio.ru/ultra-128.mp3"
  "http://s1.slotex.pl:7076/stream/1/;"
  "http://relay.181.fm:8016"
  "http://stream.radiobaobab.pl:8000/radiobaobab.mp3"
  "http://lb.zenfm.be/zenfm.mp3"
  "http://media-sov.musicradio.com/ChillMP3"
  "http://88.199.169.10:8000/"
)

echo "Testing first 20 streams..."
echo ""

for i in "${!urls[@]}"; do
  url="${urls[$i]}"
  echo -n "Stream [$i]: "
  
  # Try to connect and read first few bytes (timeout 5 seconds)
  response=$(curl -s -m 5 --range 0-100 -w "%{http_code}" -o /dev/null "$url" 2>&1)
  
  # Check if successful (200, 206 for partial content, or streaming codes)
  if [[ "$response" =~ ^(200|206)$ ]]; then
    echo "✓ OK ($response)"
  else
    echo "✗ FAILED ($response)"
  fi
done
