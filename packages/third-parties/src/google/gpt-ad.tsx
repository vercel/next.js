"use client";
import { useEffect } from "react";
import { pushGPTCommand } from "./gpt";

type Size = readonly [number, number];

interface GoogleAdProps {
    id: string;
    adUnit: string;
    sizes: Size | Size[];
    sizeMapping?: { viewport: Size; sizes: Size[] }[];
}

export function GoogleAd({ id, adUnit, sizes, sizeMapping }: GoogleAdProps) {
    useEffect(() => {
        let slot: googletag.Slot | null = null;

        pushGPTCommand(() => {
            const googletag = (window as any).googletag;

            slot = googletag.defineSlot(adUnit, sizes, id);

            if (slot) {
                if (sizeMapping) {
                    const mapping = googletag.sizeMapping();
                    sizeMapping.forEach(({ viewport, sizes }) => {
                        mapping.addSize(viewport, sizes);
                    });
                    slot.defineSizeMapping(mapping.build());
                }

                slot.addService(googletag.pubads()).setTargeting("pagepos", id);
            }

            googletag.display(id);
        });

        return () => {
            pushGPTCommand(() => {
                if (slot) {
                    window.googletag.destroySlots([slot]);
                }
            });
        };
    }, [id, adUnit, sizes, sizeMapping]);

    const sizeArray = Array.isArray(sizes[0])
        ? (sizes as [number, number][])
        : [sizes as [number, number]];

    return (
        <div
            id={id}
            style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                width: "100%",
                height: "100%",
            }}
        />
    );
}
