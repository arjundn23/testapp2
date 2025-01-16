import msalService from '../services/msalService.js';

export const getAccessToken = async (req, res) => {
  try {
    const token = await msalService.getAccessToken();
    res.json({ accessToken: token });
  } catch (error) {
    console.error('Error in getAccessToken:', error);
    res.status(500).json({ 
      message: 'Failed to acquire token',
      error: error.message 
    });
  }
};
