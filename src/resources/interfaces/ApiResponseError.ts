export interface ApiResponseError {
	code: number;
	errorObj?: string | object;
	errorsArray?: any[];
}

export interface ApiSuccessResponse {
	success: boolean,
	code: number,
	result: any;
}

export interface ApiFailureResponse {
	success: boolean,
	code: number,
	message: any;
} 