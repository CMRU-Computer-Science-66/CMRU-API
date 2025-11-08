import CryptoJS from "crypto-js";

export interface EncryptedCredentials {
	encryptedPassword: string;
	encryptedUsername: string;
}

export interface DecryptedCredentials {
	password: string;
	username: string;
}

export function decryptCredentials(encryptedCredentials: EncryptedCredentials, pin: string): DecryptedCredentials {
	try {
		const { encryptedUsername, encryptedPassword } = encryptedCredentials;
		const decryptedUsernameBytes = CryptoJS.AES.decrypt(encryptedUsername, pin);
		const username = decryptedUsernameBytes.toString(CryptoJS.enc.Utf8);
		const decryptedPasswordBytes = CryptoJS.AES.decrypt(encryptedPassword, pin);
		const password = decryptedPasswordBytes.toString(CryptoJS.enc.Utf8);

		if (!username || !password) {
			throw new Error("Decryption resulted in empty credentials");
		}

		return {
			username,
			password,
		};
	} catch {
		throw new Error("Failed to decrypt credentials: Invalid PIN or corrupted data");
	}
}

export function decryptString(encryptedValue: string, pin: string): string {
	try {
		const decryptedBytes = CryptoJS.AES.decrypt(encryptedValue, pin);
		const decryptedValue = decryptedBytes.toString(CryptoJS.enc.Utf8);

		if (!decryptedValue) {
			throw new Error("Decryption resulted in empty value");
		}

		return decryptedValue;
	} catch {
		throw new Error("Failed to decrypt string: Invalid PIN or corrupted data");
	}
}

export function validateEncryptedCredentials(data: unknown): data is EncryptedCredentials {
	return (
		typeof data === "object" &&
		data !== null &&
		typeof (data as Record<string, unknown>).encryptedUsername === "string" &&
		typeof (data as Record<string, unknown>).encryptedPassword === "string" &&
		(data as Record<string, unknown>).encryptedUsername !== undefined &&
		(data as Record<string, unknown>).encryptedPassword !== undefined &&
		((data as Record<string, unknown>).encryptedUsername as string).length > 0 &&
		((data as Record<string, unknown>).encryptedPassword as string).length > 0
	);
}

export function createHash(value: string): string {
	return CryptoJS.SHA256(value).toString();
}
