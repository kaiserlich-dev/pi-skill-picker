import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { Theme } from "../types";

export function pad(s: string, len: number): string {
	const vis = visibleWidth(s);
	return s + " ".repeat(Math.max(0, len - vis));
}

export function makeBox(innerW: number, theme: Theme) {
	function row(content = ""): string {
		const clipped = truncateToWidth(content, innerW - 1, "");
		const vis = visibleWidth(clipped);
		const padLen = Math.max(0, innerW - vis - 1);
		return (
			theme.fg("borderAccent", "│") +
			" " +
			clipped +
			" ".repeat(padLen) +
			theme.fg("borderAccent", "│")
		);
	}

	function emptyRow(): string {
		return (
			theme.fg("borderAccent", "│") +
			" ".repeat(innerW) +
			theme.fg("borderAccent", "│")
		);
	}

	function divider(): string {
		return theme.fg("borderAccent", `├${"─".repeat(innerW)}┤`);
	}

	function topBorder(title: string): string {
		const titleText = ` ${title} `;
		const borderLen = Math.max(0, innerW - titleText.length);
		const left = Math.floor(borderLen / 2);
		const right = borderLen - left;
		return (
			theme.fg("borderAccent", `╭${"─".repeat(left)}`) +
			theme.fg("accent", titleText) +
			theme.fg("borderAccent", `${"─".repeat(right)}╮`)
		);
	}

	function bottomBorder(): string {
		return theme.fg("borderAccent", `╰${"─".repeat(innerW)}╯`);
	}

	return { row, emptyRow, divider, topBorder, bottomBorder };
}
