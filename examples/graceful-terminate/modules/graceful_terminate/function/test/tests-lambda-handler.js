const chai = require('chai');
const chaiAsPromised = require("chai-as-promised");
const { mockClient } = require('aws-sdk-client-mock');
const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');
const { AutoScalingClient, CompleteLifecycleActionCommand } = require('@aws-sdk/client-auto-scaling');
const { EC2Client, DescribeInstancesCommand, TerminateInstancesCommand } = require('@aws-sdk/client-ec2');

const { handler } = require('../src/index.js');
const terminationEvent = require('./lifecycle-termination-message.json');
const testEvent = require('./lifecycle-test-message.json');

chai.use(chaiAsPromised);

const expect = chai.expect;
const ssmMock = mockClient(SSMClient);
const autoscalingMock = mockClient(AutoScalingClient);
const ec2Mock = mockClient(EC2Client);

describe('Suite - Lambda handler', () => {
  beforeEach('Reset mocks', () => {
    ssmMock.reset();
    autoscalingMock.reset();
    ec2Mock.reset();
  })

    describe('When event contains no instance ID', () => {
      it('should skip gracefully stopping runner', async () => {
        await expect(handler(testEvent)).to.eventually.equal('No instance ID, skipping');
        expect(ec2Mock.commandCalls(DescribeInstancesCommand).length).to.equal(0);
        expect(ssmMock.commandCalls(SendCommandCommand).length).to.equal(0);
        expect(ssmMock.commandCalls(GetCommandInvocationCommand).length).to.equal(0);
        expect(autoscalingMock.commandCalls(CompleteLifecycleActionCommand).length).to.equal(0);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand).length).to.equal(0);
      });
    });

    describe('When ec2 DescribeInstances fails', () => {
      it('should re-throw error in handler', async () => {
        const error = new Error("ec2 command failed");
        ec2Mock.on(DescribeInstancesCommand).rejects(error);
        await expect(handler(terminationEvent)).to.eventually.rejectedWith(error);
        expect(ec2Mock.commandCalls(DescribeInstancesCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(SendCommandCommand).length).to.equal(0);
        expect(ssmMock.commandCalls(GetCommandInvocationCommand).length).to.equal(0);
        expect(autoscalingMock.commandCalls(CompleteLifecycleActionCommand).length).to.equal(0);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand).length).to.equal(0);
      });
    });

    describe('When ssm SendCommand fails', () => {
      it('should re-throw error in handler', async () => {
        const error = new Error("ssm command failed");
        ec2Mock.on(DescribeInstancesCommand).resolves({
          Reservations: [
            {
              name: 'test'
            }
          ]
        });
        ssmMock.on(SendCommandCommand).rejects(error);
        await expect(handler(terminationEvent)).to.eventually.rejectedWith(error);
        expect(ec2Mock.commandCalls(DescribeInstancesCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(SendCommandCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(GetCommandInvocationCommand).length).to.equal(0);
        expect(autoscalingMock.commandCalls(CompleteLifecycleActionCommand).length).to.equal(0);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand).length).to.equal(0);
      });
    });

    describe('When ssm GetCommandInvocationCommand fails', () => {
      it('should re-throw error in handler', async () => {
        const error = new Error("ssm command failed");
        ec2Mock.on(DescribeInstancesCommand).resolves({
          Reservations: [
            {
              name: 'test'
            }
          ]
        });
        ssmMock.on(SendCommandCommand).resolves({
          Command: {
            CommandId: 'test'
          }
        });
        ssmMock.on(GetCommandInvocationCommand).rejects(error);
        await expect(handler(terminationEvent)).to.eventually.rejectedWith(error);
        expect(ec2Mock.commandCalls(DescribeInstancesCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(SendCommandCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(GetCommandInvocationCommand).length).to.equal(1);
        expect(autoscalingMock.commandCalls(CompleteLifecycleActionCommand).length).to.equal(0);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand).length).to.equal(0);
      });
    });

    describe('When autoscaling CompleteLifecycleActionCommand fails', () => {
      it('should re-throw error in handler', async () => {
        const error = new Error("autoscaling command failed");
        ec2Mock.on(DescribeInstancesCommand).resolves({
          Reservations: [
            {
              name: 'test'
            }
          ]
        });
        ssmMock.on(SendCommandCommand).resolves({
          Command: {
            CommandId: 'test'
          }
        });
        ssmMock.on(GetCommandInvocationCommand).resolves({
          Status: 'Success'
        });
        autoscalingMock.on(CompleteLifecycleActionCommand).rejects(error);
        await expect(handler(terminationEvent)).to.eventually.rejectedWith(error);
        expect(ec2Mock.commandCalls(DescribeInstancesCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(SendCommandCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(GetCommandInvocationCommand).length).to.equal(1);
        expect(autoscalingMock.commandCalls(CompleteLifecycleActionCommand).length).to.equal(1);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand).length).to.equal(0);
      });
    });

    describe('When ec2 TerminateInstancesCommand fails', () => {
      it('should re-throw error in handler', async () => {
        const error = new Error("ec2 command failed");
        ec2Mock.on(DescribeInstancesCommand).resolves({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: 'test'
                }
              ]
            }
          ]
        });
        ssmMock.on(SendCommandCommand).resolves({
          Command: {
            CommandId: 'test'
          }
        });
        ssmMock.on(GetCommandInvocationCommand).resolves({
          Status: 'Success'
        });
        autoscalingMock.on(CompleteLifecycleActionCommand).resolves({});
        ec2Mock.on(TerminateInstancesCommand).rejects(error);
        await expect(handler(terminationEvent)).to.eventually.rejectedWith(error);
        expect(ec2Mock.commandCalls(DescribeInstancesCommand).length).to.equal(2);
        expect(ssmMock.commandCalls(SendCommandCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(GetCommandInvocationCommand).length).to.equal(1);
        expect(autoscalingMock.commandCalls(CompleteLifecycleActionCommand).length).to.equal(1);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand).length).to.equal(1);
      });
    });

    describe('When ssm command status is not success', () => {
      it('should throw error in handler', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: 'test'
                }
              ]
            }
          ]
        });
        ssmMock.on(SendCommandCommand).resolves({
          Command: {
            CommandId: 'test'
          }
        });
        ssmMock.on(GetCommandInvocationCommand).resolves({
          Status: 'Failed'
        });
        await expect(handler(terminationEvent)).to.eventually.rejectedWith(
          'ERROR: gitlab-runner service not stopped, SSM command status:\n{"Status":"Failed"}'
        );
        expect(ec2Mock.commandCalls(DescribeInstancesCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(SendCommandCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(GetCommandInvocationCommand).length).to.equal(1);
        expect(autoscalingMock.commandCalls(CompleteLifecycleActionCommand).length).to.equal(0);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand).length).to.equal(0);
      });
    });

    describe('When manager is already terminated', () => {
      it('should only try to terminate workers', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolvesOnce({
          Reservations: []
        }).resolvesOnce({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: 'test'
                }
              ]
            }
          ]
        });
        ec2Mock.on(TerminateInstancesCommand).resolves({});
        await expect(handler(terminationEvent)).to.eventually.equal('Graceful termination successful');
        expect(ec2Mock.commandCalls(DescribeInstancesCommand).length).to.equal(2);
        expect(ssmMock.commandCalls(SendCommandCommand).length).to.equal(0);
        expect(ssmMock.commandCalls(GetCommandInvocationCommand).length).to.equal(0);
        expect(autoscalingMock.commandCalls(CompleteLifecycleActionCommand).length).to.equal(0);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand).length).to.equal(1);
      });
    });

    describe('When manager is running', () => {
      it('should complete all steps of graceful stop', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: 'test'
                }
              ]
            }
          ]
        });
        ssmMock.on(SendCommandCommand).resolves({
          Command: {
            CommandId: 'test'
          }
        });
        ssmMock.on(GetCommandInvocationCommand).resolves({
          Status: 'Success'
        });
        autoscalingMock.on(CompleteLifecycleActionCommand).resolves({});
        ec2Mock.on(TerminateInstancesCommand).resolves({});
        await expect(handler(terminationEvent)).to.eventually.equal('Graceful termination successful');
        expect(ec2Mock.commandCalls(DescribeInstancesCommand).length).to.equal(2);
        expect(ssmMock.commandCalls(SendCommandCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(GetCommandInvocationCommand).length).to.equal(1);
        expect(autoscalingMock.commandCalls(CompleteLifecycleActionCommand).length).to.equal(1);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand).length).to.equal(1);
      });
    });

    describe('When manager has single worker', () => {
      it('should terminate single worker', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: 'test1'
                }
              ]
            }
          ]
        });
        ssmMock.on(SendCommandCommand).resolves({
          Command: {
            CommandId: 'test'
          }
        });
        ssmMock.on(GetCommandInvocationCommand).resolves({
          Status: 'Success'
        });
        autoscalingMock.on(CompleteLifecycleActionCommand).resolves({});
        ec2Mock.on(TerminateInstancesCommand).resolves({});
        await expect(handler(terminationEvent)).to.eventually.equal('Graceful termination successful');
        expect(ec2Mock.commandCalls(DescribeInstancesCommand).length).to.equal(2);
        expect(ssmMock.commandCalls(SendCommandCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(GetCommandInvocationCommand).length).to.equal(1);
        expect(autoscalingMock.commandCalls(CompleteLifecycleActionCommand).length).to.equal(1);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand).length).to.equal(1);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand)[0].calledWith({
          InstanceIds: ['test1']
        }));
      });
    });

    describe('When manager has multiple workers', () => {
      it('should terminate all workers', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: 'test1'
                },
                {
                  InstanceId: 'test2'
                }
              ]
            },
            {
              Instances: [
                {
                  InstanceId: 'test3'
                }
              ]
            }
          ]
        });
        ssmMock.on(SendCommandCommand).resolves({
          Command: {
            CommandId: 'test'
          }
        });
        ssmMock.on(GetCommandInvocationCommand).resolves({
          Status: 'Success'
        });
        autoscalingMock.on(CompleteLifecycleActionCommand).resolves({});
        ec2Mock.on(TerminateInstancesCommand).resolves({});
        await expect(handler(terminationEvent)).to.eventually.equal('Graceful termination successful');
        expect(ec2Mock.commandCalls(DescribeInstancesCommand).length).to.equal(2);
        expect(ssmMock.commandCalls(SendCommandCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(GetCommandInvocationCommand).length).to.equal(1);
        expect(autoscalingMock.commandCalls(CompleteLifecycleActionCommand).length).to.equal(1);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand).length).to.equal(1);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand)[0].calledWith({
          InstanceIds: ['test1', 'test2', 'test3']
        }));
      });
    });

    describe('When manager has no workers', () => {
      it('should not attempt to terminate workers', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolvesOnce({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: 'test'
                }
              ]
            }
          ]
        }).resolvesOnce({
          Reservations: []
        });
        ssmMock.on(SendCommandCommand).resolves({
          Command: {
            CommandId: 'test'
          }
        });
        ssmMock.on(GetCommandInvocationCommand).resolves({
          Status: 'Success'
        });
        autoscalingMock.on(CompleteLifecycleActionCommand).resolves({});
        ec2Mock.on(TerminateInstancesCommand).resolves({});
        await expect(handler(terminationEvent)).to.eventually.equal('Graceful termination successful');
        expect(ec2Mock.commandCalls(DescribeInstancesCommand).length).to.equal(2);
        expect(ssmMock.commandCalls(SendCommandCommand).length).to.equal(1);
        expect(ssmMock.commandCalls(GetCommandInvocationCommand).length).to.equal(1);
        expect(autoscalingMock.commandCalls(CompleteLifecycleActionCommand).length).to.equal(1);
        expect(ec2Mock.commandCalls(TerminateInstancesCommand).length).to.equal(0);
      });
    });
});
