/**
 * Netlify Function: Pinata IPFS Upload with Group Management
 *
 * This function handles file uploads to Pinata IPFS using the v3 SDK,
 * manages user groups, and adds files to groups - all server-side to avoid CORS.
 *
 * Request body:
 * {
 *   fileData: string,        // Base64 encoded file content
 *   fileName: string,         // File name
 *   mimeType: string,        // MIME type (e.g., "application/json")
 *   userDid: string,         // User's DID for group organization
 *   serviceName: string,     // Service name for metadata
 *   jwt: string              // User's Pinata JWT
 * }
 *
 * Response:
 * {
 *   success: true,
 *   cid: string,
 *   groupId: string
 * }
 */

import { PinataSDK } from 'pinata';

// Cache for group IDs to avoid recreating
const groupCache = new Map();

export async function handler(event) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request body
    const { fileData, fileName, mimeType, userDid, serviceName, jwt } = JSON.parse(event.body);

    // Validate required fields
    if (!fileData || !fileName || !jwt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: fileData, fileName, jwt' }),
      };
    }

    // Initialize Pinata SDK with user's JWT
    const pinata = new PinataSDK({
      pinataJwt: jwt,
    });

    console.log('📤 Starting upload for:', fileName);

    // Step 1: Get or create user group
    let groupId = null;
    if (userDid) {
      const cacheKey = `${jwt.substring(0, 20)}-${userDid}`;

      // Check cache first
      if (groupCache.has(cacheKey)) {
        groupId = groupCache.get(cacheKey);
        console.log('📁 Using cached group:', groupId);
      } else {
        // Try to find existing group
        try {
          const groups = await pinata.groups.public.list();
          const existingGroup = groups.groups?.find(g => g.name === userDid);

          if (existingGroup) {
            groupId = existingGroup.id;
            console.log('✅ Found existing group:', userDid, 'ID:', groupId);
          } else {
            // Create new group
            const newGroup = await pinata.groups.public.create({ name: userDid });
            groupId = newGroup.id;
            console.log('✅ Created new group:', userDid, 'ID:', groupId);
          }

          // Cache the group ID
          groupCache.set(cacheKey, groupId);
        } catch (groupError) {
          console.warn('⚠️ Group management failed:', groupError.message);
          // Continue without group if it fails
        }
      }
    }

    // Step 2: Convert base64 to File object
    const buffer = Buffer.from(fileData, 'base64');
    const blob = new Blob([buffer], { type: mimeType || 'application/json' });
    const file = new File([blob], fileName, { type: mimeType || 'application/json' });

    // Step 3: Upload file with metadata and add to group in one call
    const metadata = {
      name: serviceName ? `${serviceName}/${fileName}` : fileName,
      keyvalues: {
        uploadedAt: new Date().toISOString(),
        type: 'json',
      },
    };

    if (userDid) {
      metadata.keyvalues.userDid = userDid;
    }

    if (serviceName) {
      metadata.keyvalues.service = serviceName;
    }

    // Upload with group assignment
    let upload;
    if (groupId) {
      console.log('📂 Uploading and adding to group:', groupId);
      upload = await pinata.upload.public.file(file)
        .group(groupId)
        .addMetadata(metadata);
    } else {
      console.log('📤 Uploading without group');
      upload = await pinata.upload.public.file(file)
        .addMetadata(metadata);
    }

    console.log('✅ Upload successful, CID:', upload.cid);

    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        cid: upload.cid,
        id: upload.id,
        groupId: groupId,
      }),
    };

  } catch (error) {
    console.error('❌ Upload failed:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        details: error.toString(),
      }),
    };
  }
}
