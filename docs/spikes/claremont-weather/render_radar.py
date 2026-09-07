"""Offline assembly of real radar images on one cached geographic basemap."""

import json
import math
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

BASE = Path(__file__).resolve().parent
CACHE, ASSETS = BASE / "cache", BASE / "assets"
EXTENT = json.loads((CACHE / "extent.json").read_text())
W, H = EXTENT["width"], EXTENT["height"]
HALF = math.pi * 6378137
OPACITY = 0.65


def font(size):
    for path in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                 "/System/Library/Fonts/Supplemental/Arial.ttf"]:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def mosaic(source):
    config = EXTENT[source + "Tiles"]
    size, z = config["size"], config["z"]
    im = Image.new("RGBA", ((config["x1"] - config["x0"] + 1) * size,
                            (config["y1"] - config["y0"] + 1) * size))
    for y in range(config["y0"], config["y1"] + 1):
        for x in range(config["x0"], config["x1"] + 1):
            tile = Image.open(CACHE / f"{source}-{z}-{x}-{y}.png").convert("RGBA")
            assert tile.size == (size, size)
            im.paste(tile, ((x - config["x0"]) * size, (y - config["y0"]) * size))
    west, south, east, north = EXTENT["mercator"]
    span = 2 * HALF / 2**z
    box = ((west + HALF) / span * size - config["x0"] * size,
           (HALF - north) / span * size - config["y0"] * size,
           (east + HALF) / span * size - config["x0"] * size,
           (HALF - south) / span * size - config["y0"] * size)
    return im.transform((W, H), Image.Transform.EXTENT, box, Image.Resampling.BICUBIC)


def label_image(im, name, valid, units, attribution, legend=None):
    # All decoration is inside the identical map extent.
    draw = ImageDraw.Draw(im)
    draw.rounded_rectangle((14, 14, 420, 75), 8, fill=(250, 252, 251, 245))
    draw.text((27, 24), name, font=font(19), fill="#172c3d")
    time = datetime.fromisoformat(valid.replace("Z", "+00:00")).astimezone(ZoneInfo("America/Los_Angeles"))
    draw.text((27, 50), time.strftime("%b %d · %I:%M %p PDT") + " · " + units, font=font(12), fill="#354c5c")
    cx, cy = W // 2, H // 2
    draw.ellipse((cx-9, cy-9, cx+9, cy+9), fill="white", outline="#12394d", width=2)
    draw.ellipse((cx-4, cy-4, cx+4, cy+4), fill="#093f55")
    draw.rounded_rectangle((cx+14, cy-14, cx+128, cy+13), 5, fill=(255,255,255,245))
    draw.text((cx+22, cy-9), "Claremont", font=font(16), fill="#12394d")
    draw.rounded_rectangle((W-60, 14, W-14, 74), 7, fill=(255,255,255,245))
    draw.text((W-44, 20), "N", font=font(16), fill="#12394d")
    draw.line((W-37, 62, W-37, 43), fill="#12394d", width=2)
    draw.polygon([(W-37,38),(W-42,47),(W-32,47)], fill="#12394d")
    draw.rectangle((0,H-35,W,H),fill=(250,252,251,250))
    draw.text((14,H-24), "Radar opacity 65% · original provider palette", font=font(11), fill="#294956")
    draw.text((440,H-24), attribution+" · © OpenStreetMap contributors", font=font(10), fill="#294956")
    if legend and legend.exists():
        key = Image.open(legend).convert("RGBA")
        # Native legend labels retained; bound the inset to preserve map visibility.
        key.thumbnail((420, 70) if key.width > key.height else (140, 413), Image.Resampling.LANCZOS)
        x,y=W-key.width-18,H-key.height-48
        draw.rounded_rectangle((x-6,y-6,x+key.width+6,y+key.height+6),6,fill="white")
        im.alpha_composite(key,(x,y))
    return im


def main():
    base = ImageEnhance.Color(mosaic("osm").convert("RGB")).enhance(.45)
    base = Image.blend(base,Image.new("RGB",base.size,"#f5f5ee"),.24)
    base.save(ASSETS / "basemap.png")
    records = [
        ("rainviewer","RainViewer",EXTENT["radarTime"],"dBZ","RainViewer",None),
        ("mrms","NOAA MRMS mosaic",EXTENT["mrmsTime"],"dBZ","NOAA / NWS","noaa-legend.png"),
        ("sox","NOAA NEXRAD · KSOX",EXTENT["soxTime"],"dBZ","NOAA / NWS","noaa-legend.png"),
        ("eccc","ECCC North American radar",EXTENT["ecccTime"],"mm/h","ECCC / MSC","eccc-legend.png"),
    ]
    report = {}
    for key,name,valid,units,attribution,legend in records:
        radar = mosaic("rainviewer") if key == "rainviewer" else Image.open(CACHE/(key+".png")).convert("RGBA")
        assert radar.size == (W,H)
        source_alpha = radar.getchannel("A")
        radar.putalpha(source_alpha.point(lambda value: round(value*OPACITY)))
        image = Image.alpha_composite(base.convert("RGBA"),radar)
        image = label_image(image,name,valid,units,attribution,CACHE/legend if legend else None)
        filename = key+"-radar.png"
        image.convert("RGB").save(ASSETS/filename)
        report[key]={"status":"ok","file":"assets/"+filename,"validTime":valid,
                     "sourceAlphaRange":source_alpha.getextrema(),"opacity":OPACITY,
                     "size":[W,H],"bbox":EXTENT["bbox"],"units":units}
        print(key,filename,"valid",valid)
    (CACHE/"radar-render-report.json").write_text(json.dumps(report,indent=2)+"\n")


if __name__ == "__main__":
    main()
