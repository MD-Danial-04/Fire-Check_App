import { NextResponse } from 'next/server';

// Field IDs for the form
const FIELD_IDS = {
  name: '6502c44bde2cb10011b4d19e',
  vessel: '6502d744356d4700127c28e4',
  lfav: '6502d8862ccd0f00122e8196'
} as const;

// Base form URL
const FORM_URL = 'https://form.gov.sg/65031149356d470012810f7f';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const params = new URLSearchParams();

    // Add name parameter
    if (data.name) {
      params.append(FIELD_IDS.name, data.name);
    }

    // Add vessel BA set if available
    if (data.baSets?.vessel) {
      const vesselSet = `${data.baSets.vessel.appliance} / ${data.baSets.vessel.backplate} / ${data.baSets.vessel.cylinder}`;
      params.append(FIELD_IDS.vessel, vesselSet);
    }

    // Add LFAV BA set if available
    if (data.baSets?.lf) {
      const lfSet = `${data.baSets.lf.appliance} / ${data.baSets.lf.backplate} / ${data.baSets.lf.cylinder}`;
      params.append(FIELD_IDS.lfav, lfSet);
    }

    // Generate the pre-filled URL
    const prefilledUrl = `${FORM_URL}?${params.toString()}`;

    return NextResponse.json({
      success: true,
      url: prefilledUrl
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Failed to generate form URL'
    }, { 
      status: 400 
    });
  }
} 