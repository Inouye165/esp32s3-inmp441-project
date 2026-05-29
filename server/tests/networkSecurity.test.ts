import { Request, Response, NextFunction } from 'express';
import { networkSecurityMiddleware, clearNetworkCache } from '../src/middleware/networkSecurity';
import * as networkChecker from '../src/services/networkChecker';

// Mock the network checker service
jest.mock('../src/services/networkChecker');

describe('Network Security Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    // Clear cache before each test
    clearNetworkCache();
    
    mockReq = {
      path: '/config',
      method: 'GET',
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    
    mockNext = jest.fn();
    
    jest.clearAllMocks();
  });

  describe('when on approved network', () => {
    beforeEach(() => {
      jest.spyOn(networkChecker, 'checkNetworkConnection').mockResolvedValue({
        connected: true,
        networkName: 'Dobby',
        isAllowed: true,
        allowedNetworks: ['Dobby'],
      });
    });

    it('allows requests to proceed', async () => {
      await networkSecurityMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('caches network status for 5 seconds', async () => {
      // First request
      await networkSecurityMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      // Second request within cache window
      await networkSecurityMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      // Should only check network once due to caching
      expect(networkChecker.checkNetworkConnection).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledTimes(2);
    });
  });

  describe('when not on approved network', () => {
    beforeEach(() => {
      jest.spyOn(networkChecker, 'checkNetworkConnection').mockResolvedValue({
        connected: true,
        networkName: 'UntrustedNetwork',
        isAllowed: false,
        allowedNetworks: ['Dobby'],
      });
    });

    it('blocks requests with 403 status', async () => {
      await networkSecurityMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Forbidden',
        code: 'NETWORK_NOT_APPROVED',
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('includes network information in error response', async () => {
      await networkSecurityMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        currentNetwork: 'UntrustedNetwork',
        allowedNetworks: ['Dobby'],
      }));
    });

    it('caches blocked status for 5 seconds', async () => {
      // First request
      await networkSecurityMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      // Second request within cache window
      await networkSecurityMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      // Should only check network once due to caching
      expect(networkChecker.checkNetworkConnection).toHaveBeenCalledTimes(1);
      expect(mockRes.status).toHaveBeenCalledTimes(2);
    });
  });

  describe('network check endpoint bypass', () => {
    it('allows /network/check endpoint even when not on approved network', async () => {
      mockReq = { ...mockReq, path: '/network/check', method: 'GET' };
      
      jest.spyOn(networkChecker, 'checkNetworkConnection').mockResolvedValue({
        connected: true,
        networkName: 'UntrustedNetwork',
        isAllowed: false,
        allowedNetworks: ['Dobby'],
      });

      await networkSecurityMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(networkChecker.checkNetworkConnection).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('blocks requests when network check fails', async () => {
      jest.spyOn(networkChecker, 'checkNetworkConnection').mockRejectedValue(
        new Error('Network error')
      );

      await networkSecurityMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Service Unavailable',
        code: 'NETWORK_CHECK_FAILED',
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('not connected to network', () => {
    it('blocks requests when not connected to any network', async () => {
      jest.spyOn(networkChecker, 'checkNetworkConnection').mockResolvedValue({
        connected: false,
        networkName: null,
        isAllowed: false,
        allowedNetworks: ['Dobby'],
      });

      await networkSecurityMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
